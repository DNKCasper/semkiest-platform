# =============================================================================
# SemkiEst Platform – ECS Fargate (API + Worker)
# =============================================================================
# Resources:
#   • ECR repositories
#   • ECS cluster with Container Insights
#   • CloudWatch log groups
#   • ALB + target group + listeners
#   • Task definitions (API, worker)
#   • ECS services with auto-scaling
# =============================================================================

# -----------------------------------------------------------------------------
# ECR Repositories
# -----------------------------------------------------------------------------

resource "aws_ecr_repository" "api" {
  name                 = "${local.name_prefix}/api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "${local.name_prefix}-ecr-api"
  }
}

resource "aws_ecr_repository" "worker" {
  name                 = "${local.name_prefix}/worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name = "${local.name_prefix}-ecr-worker"
  }
}

# Lifecycle policy: keep last 10 images
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy     = local.ecr_lifecycle_policy
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name
  policy     = local.ecr_lifecycle_policy
}

locals {
  ecr_lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 tagged images"
        selection = {
          tagStatus   = "tagged"
          tagPrefixList = ["v", "sha-"]
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Expire untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
    ]
  })
}

# -----------------------------------------------------------------------------
# ECS Cluster
# -----------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Log Groups
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name_prefix}/api"
  retention_in_days = 30

  tags = {
    Name = "${local.name_prefix}-api-logs"
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name_prefix}/worker"
  retention_in_days = 30

  tags = {
    Name = "${local.name_prefix}-worker-logs"
  }
}

# -----------------------------------------------------------------------------
# Application Load Balancer
# -----------------------------------------------------------------------------

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = var.environment == "production"

  tags = {
    Name = "${local.name_prefix}-alb"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${local.name_prefix}-api-tg"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 30
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Name = "${local.name_prefix}-api-tg"
  }
}

# HTTP listener - forward to target group directly (no cert needed for staging)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTPS listener - only created when an ACM certificate is provided
resource "aws_lb_listener" "https" {
  count = var.cloudfront_acm_certificate_arn != "" ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.cloudfront_acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  lifecycle {
    ignore_changes = [certificate_arn]
  }
}

# -----------------------------------------------------------------------------
# ECS Task Definitions
# -----------------------------------------------------------------------------

# Secrets to inject from Secrets Manager (populated in secrets.tf)
locals {
  api_secrets = [
    {
      name      = "DATABASE_URL"
      valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::"
    },
    {
      name      = "REDIS_URL"
      valueFrom = "${aws_secretsmanager_secret.app.arn}:REDIS_URL::"
    },
    {
      name      = "JWT_SECRET"
      valueFrom = "${aws_secretsmanager_secret.app.arn}:JWT_SECRET::"
    },
  ]

  worker_secrets = [
    {
      name      = "DATABASE_URL"
      valueFrom = "${aws_secretsmanager_secret.app.arn}:DATABASE_URL::"
    },
    {
      name      = "REDIS_URL"
      valueFrom = "${aws_secretsmanager_secret.app.arn}:REDIS_URL::"
    },
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name_prefix}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_api_cpu
  memory                   = var.ecs_api_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_api_task.arn

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.ecr_api_image_uri
      essential = true

      portMappings = [
        {
          containerPort = 3001
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "PORT", value = "3001" },
        { name = "HOST", value = "0.0.0.0" },
        { name = "S3_BUCKET", value = var.s3_uploads_bucket_name },
        { name = "S3_REGION", value = var.aws_region },
        { name = "LOG_LEVEL", value = "info" },
      ]

      secrets = local.api_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3001/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${local.name_prefix}-api-task"
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ecs_worker_cpu
  memory                   = var.ecs_worker_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_worker_task.arn

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = var.ecr_worker_image_uri
      essential = true

      environment = [
        { name = "NODE_ENV", value = var.environment },
        { name = "S3_BUCKET", value = var.s3_uploads_bucket_name },
        { name = "S3_REGION", value = var.aws_region },
        { name = "WORKER_CONCURRENCY", value = "5" },
        { name = "LOG_LEVEL", value = "info" },
      ]

      secrets = local.worker_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "worker"
        }
      }
    }
  ])

  tags = {
    Name = "${local.name_prefix}-worker-task"
  }
}

# -----------------------------------------------------------------------------
# ECS Services
# -----------------------------------------------------------------------------

resource "aws_ecs_service" "api" {
  name                               = "${local.name_prefix}-api"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.ecs_api_desired_count
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = 120
  enable_execute_command             = var.environment != "production"
  force_new_deployment               = false

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_api.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  tags = {
    Name = "${local.name_prefix}-api-service"
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [
    aws_lb_listener.http,
    aws_iam_role_policy_attachment.ecs_task_execution_managed,
  ]
}

resource "aws_ecs_service" "worker" {
  name             = "${local.name_prefix}-worker"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.worker.arn
  desired_count    = var.ecs_worker_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  enable_execute_command = var.environment != "production"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_worker.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  tags = {
    Name = "${local.name_prefix}-worker-service"
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_iam_role_policy_attachment.ecs_task_execution_managed]
}

# -----------------------------------------------------------------------------
# Auto-scaling - API service (request-based)
# -----------------------------------------------------------------------------

resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.ecs_api_max_count
  min_capacity       = var.ecs_api_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  depends_on = [aws_ecs_service.api]
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name_prefix}-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 65
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "api_memory" {
  name               = "${local.name_prefix}-api-memory-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 80
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}

# -----------------------------------------------------------------------------
# Auto-scaling - Worker service (queue-depth based)
# -----------------------------------------------------------------------------

resource "aws_appautoscaling_target" "worker" {
  max_capacity       = var.ecs_worker_max_count
  min_capacity       = var.ecs_worker_min_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  depends_on = [aws_ecs_service.worker]
}

resource "aws_appautoscaling_policy" "worker_cpu" {
  name               = "${local.name_prefix}-worker-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.worker.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = 70
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
