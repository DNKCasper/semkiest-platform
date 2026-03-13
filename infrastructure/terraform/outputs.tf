# =============================================================================
# SemkiEst Platform – Terraform Outputs
# =============================================================================
# These outputs are consumed by the CI/CD pipeline to wire up application
# configuration (e.g. ALB DNS name for DNS records, ECR URIs for image pushes).
# =============================================================================

# -----------------------------------------------------------------------------
# VPC
# -----------------------------------------------------------------------------

output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets (ECS tasks, ElastiCache)."
  value       = aws_subnet.private[*].id
}

output "database_subnet_ids" {
  description = "IDs of the isolated database subnets."
  value       = aws_subnet.database[*].id
}

# -----------------------------------------------------------------------------
# Security Groups
# -----------------------------------------------------------------------------

output "sg_alb_id" {
  description = "Security group ID for the Application Load Balancer."
  value       = aws_security_group.alb.id
}

output "sg_ecs_api_id" {
  description = "Security group ID for the API ECS tasks."
  value       = aws_security_group.ecs_api.id
}

output "sg_ecs_worker_id" {
  description = "Security group ID for the worker ECS tasks."
  value       = aws_security_group.ecs_worker.id
}

output "sg_rds_id" {
  description = "Security group ID for RDS."
  value       = aws_security_group.rds.id
}

output "sg_redis_id" {
  description = "Security group ID for ElastiCache Redis."
  value       = aws_security_group.redis.id
}

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------

output "ecs_cluster_name" {
  description = "Name of the ECS cluster."
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster."
  value       = aws_ecs_cluster.main.arn
}

output "ecr_api_repository_url" {
  description = "URL of the API ECR repository."
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_worker_repository_url" {
  description = "URL of the worker ECR repository."
  value       = aws_ecr_repository.worker.repository_url
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer."
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Route 53 hosted zone ID of the ALB (for alias records)."
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer."
  value       = aws_lb.main.arn
}

output "ecs_api_service_name" {
  description = "Name of the API ECS service."
  value       = aws_ecs_service.api.name
}

output "ecs_worker_service_name" {
  description = "Name of the worker ECS service."
  value       = aws_ecs_service.worker.name
}

# -----------------------------------------------------------------------------
# RDS
# -----------------------------------------------------------------------------

output "rds_endpoint" {
  description = "RDS instance endpoint (host:port)."
  value       = "${aws_db_instance.main.address}:${aws_db_instance.main.port}"
}

output "rds_address" {
  description = "RDS instance hostname."
  value       = aws_db_instance.main.address
}

output "rds_port" {
  description = "RDS instance port."
  value       = aws_db_instance.main.port
}

output "rds_database_name" {
  description = "Name of the RDS database."
  value       = aws_db_instance.main.db_name
}

output "rds_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret that stores RDS credentials."
  value       = aws_secretsmanager_secret.rds.arn
}

# -----------------------------------------------------------------------------
# ElastiCache Redis
# -----------------------------------------------------------------------------

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint."
  value       = "${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.cache_nodes[0].port}"
}

output "redis_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret that stores Redis credentials."
  value       = aws_secretsmanager_secret.redis.arn
}

# -----------------------------------------------------------------------------
# S3
# -----------------------------------------------------------------------------

output "s3_uploads_bucket_name" {
  description = "Name of the uploads S3 bucket."
  value       = aws_s3_bucket.uploads.bucket
}

output "s3_uploads_bucket_arn" {
  description = "ARN of the uploads S3 bucket."
  value       = aws_s3_bucket.uploads.arn
}

output "s3_artifacts_bucket_name" {
  description = "Name of the artifacts S3 bucket."
  value       = aws_s3_bucket.artifacts.bucket
}

output "s3_logs_bucket_name" {
  description = "Name of the access logs S3 bucket."
  value       = aws_s3_bucket.logs.bucket
}

# -----------------------------------------------------------------------------
# CloudFront
# -----------------------------------------------------------------------------

output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution."
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_distribution_domain_name" {
  description = "Domain name of the CloudFront distribution."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_arn" {
  description = "ARN of the CloudFront distribution."
  value       = aws_cloudfront_distribution.main.arn
}

# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

output "app_secrets_arn" {
  description = "ARN of the application secrets in Secrets Manager."
  value       = aws_secretsmanager_secret.app.arn
}

# -----------------------------------------------------------------------------
# IAM Roles
# -----------------------------------------------------------------------------

output "ecs_task_execution_role_arn" {
  description = "ARN of the ECS task execution IAM role."
  value       = aws_iam_role.ecs_task_execution.arn
}

output "ecs_api_task_role_arn" {
  description = "ARN of the ECS API task IAM role."
  value       = aws_iam_role.ecs_api_task.arn
}

output "ecs_worker_task_role_arn" {
  description = "ARN of the ECS worker task IAM role."
  value       = aws_iam_role.ecs_worker_task.arn
}
