# =============================================================================
# SemkiEst Platform – IAM Roles & Policies
# =============================================================================
# Follows the least-privilege principle:
#   • ECS task execution role – pull images, write CloudWatch logs, read secrets
#   • ECS API task role       – S3, Secrets Manager
#   • ECS worker task role    – S3, Secrets Manager
# =============================================================================

# -----------------------------------------------------------------------------
# ECS Task Execution Role
# (used by the ECS agent to start tasks, not by the application itself)
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_task_execution_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${local.name_prefix}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json
  description        = "ECS task execution role for ${local.name_prefix} – pulls images and writes logs"

  tags = {
    Name = "${local.name_prefix}-ecs-task-execution"
  }
}

# AWS-managed policy: ECR pull + CloudWatch Logs write
resource "aws_iam_role_policy_attachment" "ecs_task_execution_managed" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Allow ECS agent to read secrets from Secrets Manager at task startup
data "aws_iam_policy_document" "ecs_execution_secrets" {
  statement {
    sid    = "ReadSecretsManager"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:*:secret:${local.name_prefix}/*",
    ]
  }

  statement {
    sid    = "DecryptKMS"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.aws_region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name   = "read-secrets"
  role   = aws_iam_role.ecs_task_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secrets.json
}

# -----------------------------------------------------------------------------
# ECS API Task Role
# (assumed by the application code running inside the container)
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ecs_api_task" {
  name               = "${local.name_prefix}-ecs-api-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json
  description        = "Runtime role for the API ECS task – S3, Secrets Manager"

  tags = {
    Name = "${local.name_prefix}-ecs-api-task"
  }
}

data "aws_iam_policy_document" "ecs_api_task" {
  # S3 – uploads bucket read/write
  statement {
    sid    = "S3Uploads"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/*",
    ]
  }

  # S3 – artifacts bucket read
  statement {
    sid    = "S3ArtifactsRead"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  # Secrets Manager – read runtime secrets
  statement {
    sid    = "SecretsRead"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:*:secret:${local.name_prefix}/*",
    ]
  }

  # CloudWatch – structured logging from application code
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:*:log-group:/ecs/${local.name_prefix}*"]
  }
}

resource "aws_iam_role_policy" "ecs_api_task" {
  name   = "api-task-policy"
  role   = aws_iam_role.ecs_api_task.id
  policy = data.aws_iam_policy_document.ecs_api_task.json
}

# -----------------------------------------------------------------------------
# ECS Worker Task Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "ecs_worker_task" {
  name               = "${local.name_prefix}-ecs-worker-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_execution_assume.json
  description        = "Runtime role for the worker ECS task – S3, Secrets Manager"

  tags = {
    Name = "${local.name_prefix}-ecs-worker-task"
  }
}

data "aws_iam_policy_document" "ecs_worker_task" {
  # S3 – read uploads, write artifacts
  statement {
    sid    = "S3UploadsRead"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/*",
    ]
  }

  statement {
    sid    = "S3ArtifactsWrite"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  # Secrets Manager
  statement {
    sid    = "SecretsRead"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      "arn:aws:secretsmanager:${var.aws_region}:*:secret:${local.name_prefix}/*",
    ]
  }

  # CloudWatch
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.aws_region}:*:log-group:/ecs/${local.name_prefix}*"]
  }
}

resource "aws_iam_role_policy" "ecs_worker_task" {
  name   = "worker-task-policy"
  role   = aws_iam_role.ecs_worker_task.id
  policy = data.aws_iam_policy_document.ecs_worker_task.json
}

# -----------------------------------------------------------------------------
# CloudFront Origin Access Identity IAM
# (referenced in s3.tf bucket policy)
# -----------------------------------------------------------------------------

# See cloudfront.tf for the OAC resource.
# Bucket policies that reference the CloudFront distribution are in s3.tf.
