# =============================================================================
# SemkiEst Platform – Automated PostgreSQL Backups (AWS Backup)
#
# Provisions:
#   - AWS Backup vault for storing RDS snapshots
#   - Daily backup plan with 30-day retention
#   - IAM role allowing AWS Backup to snapshot RDS instances
#   - Backup selection targeting the SemkiEst RDS cluster
# =============================================================================

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "environment" {
  description = "Deployment environment (development, staging, production)"
  type        = string
}

variable "project" {
  description = "Project name used as a resource name prefix"
  type        = string
  default     = "semkiest"
}

variable "backup_retention_days" {
  description = "Number of days to retain daily RDS backups"
  type        = number
  default     = 30
}

variable "backup_schedule_cron" {
  description = "Cron expression for the backup schedule (UTC)"
  type        = string
  # Daily at 03:00 UTC – outside business hours for most regions
  default = "cron(0 3 * * ? *)"
}

variable "rds_cluster_arn" {
  description = "ARN of the RDS cluster to back up"
  type        = string
}

# -----------------------------------------------------------------------------
# Backup Vault
# -----------------------------------------------------------------------------

resource "aws_backup_vault" "main" {
  name        = "${var.project}-${var.environment}-backup-vault"
  kms_key_arn = aws_kms_key.backup.arn

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# KMS key for encrypting backups at rest
resource "aws_kms_key" "backup" {
  description             = "${var.project} ${var.environment} backup encryption key"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "backup" {
  name          = "alias/${var.project}-${var.environment}-backup"
  target_key_id = aws_kms_key.backup.key_id
}

# -----------------------------------------------------------------------------
# Backup Plan
# -----------------------------------------------------------------------------

resource "aws_backup_plan" "daily" {
  name = "${var.project}-${var.environment}-daily-backup"

  rule {
    rule_name         = "daily-rds-backup"
    target_vault_name = aws_backup_vault.main.name
    schedule          = var.backup_schedule_cron

    lifecycle {
      delete_after = var.backup_retention_days
    }

    recovery_point_tags = {
      Project     = var.project
      Environment = var.environment
      BackupType  = "daily"
    }
  }

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# IAM Role for AWS Backup
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "backup_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${var.project}-${var.environment}-backup-role"
  assume_role_policy = data.aws_iam_policy_document.backup_assume_role.json

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "backup_rds" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "backup_restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# -----------------------------------------------------------------------------
# Backup Selection – targets the RDS cluster
# -----------------------------------------------------------------------------

resource "aws_backup_selection" "rds" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = "${var.project}-${var.environment}-rds-selection"
  plan_id      = aws_backup_plan.daily.id

  resources = [var.rds_cluster_arn]
}

# -----------------------------------------------------------------------------
# CloudWatch Alarm – alert if a backup job fails
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "backup_failure" {
  alarm_name          = "${var.project}-${var.environment}-backup-job-failed"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "NumberOfBackupJobsFailed"
  namespace           = "AWS/Backup"
  period              = 86400 # 24 hours
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "One or more backup jobs failed in the last 24 hours"
  treat_missing_data  = "notBreaching"

  dimensions = {
    BackupVaultName = aws_backup_vault.main.name
  }

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "backup_vault_arn" {
  description = "ARN of the AWS Backup vault"
  value       = aws_backup_vault.main.arn
}

output "backup_vault_name" {
  description = "Name of the AWS Backup vault"
  value       = aws_backup_vault.main.name
}

output "backup_plan_id" {
  description = "ID of the daily backup plan"
  value       = aws_backup_plan.daily.id
}

output "backup_kms_key_arn" {
  description = "ARN of the KMS key used to encrypt backups"
  value       = aws_kms_key.backup.arn
}
