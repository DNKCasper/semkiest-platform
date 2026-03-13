# =============================================================================
# SemkiEst Platform – Database Security Hardening
#
# Provisions:
#   - RDS subnet group (private subnets only)
#   - Security group restricting DB access to API/worker services
#   - KMS key for RDS encryption at rest
#   - Secrets Manager secret for database credentials
#   - RDS cluster with encryption, enhanced monitoring, and deletion protection
#   - DB connection pool parameter group tuned for high concurrency
# =============================================================================

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "vpc_id" {
  description = "VPC ID where the RDS cluster will be deployed"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for the RDS subnet group"
  type        = list(string)
}

variable "api_security_group_id" {
  description = "Security group ID of the API service (granted DB access)"
  type        = string
}

variable "worker_security_group_id" {
  description = "Security group ID of the worker service (granted DB access)"
  type        = string
}

variable "db_name" {
  description = "Name of the PostgreSQL database"
  type        = string
  default     = "semkiest"
}

variable "db_username" {
  description = "Master username for the RDS cluster"
  type        = string
  default     = "semkiest"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GiB"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Maximum storage for autoscaling in GiB"
  type        = number
  default     = 100
}

variable "db_backup_retention_period" {
  description = "Days to retain automated RDS backups (in addition to AWS Backup)"
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for high availability"
  type        = bool
  default     = true
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16.2"
}

# -----------------------------------------------------------------------------
# KMS Key for RDS Encryption at Rest
# -----------------------------------------------------------------------------

resource "aws_kms_key" "rds" {
  description             = "${var.project} ${var.environment} RDS encryption key"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "rds" {
  name          = "alias/${var.project}-${var.environment}-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# -----------------------------------------------------------------------------
# Secrets Manager – Database Credentials
# -----------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.project}/${var.environment}/db-credentials"
  description             = "PostgreSQL master credentials for ${var.project} ${var.environment}"
  kms_key_id              = aws_kms_key.rds.arn
  recovery_window_in_days = 7

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id

  secret_string = jsonencode({
    username = var.db_username
    password = random_password.db.result
    dbname   = var.db_name
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    engine   = "postgres"
  })

  # Rotate after the DB instance is created
  depends_on = [aws_db_instance.main]
}

resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}:?"
}

# -----------------------------------------------------------------------------
# Security Group – restrict DB access
# -----------------------------------------------------------------------------

resource "aws_security_group" "rds" {
  name        = "${var.project}-${var.environment}-rds-sg"
  description = "Allow PostgreSQL access only from API and worker services"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from API service"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.api_security_group_id]
  }

  ingress {
    description     = "PostgreSQL from worker service"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.worker_security_group_id]
  }

  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Name        = "${var.project}-${var.environment}-rds-sg"
  }
}

# -----------------------------------------------------------------------------
# DB Subnet Group (private subnets only)
# -----------------------------------------------------------------------------

resource "aws_db_subnet_group" "main" {
  name        = "${var.project}-${var.environment}-db-subnet-group"
  description = "Private subnet group for ${var.project} ${var.environment} RDS"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# DB Parameter Group – connection pool tuning
# -----------------------------------------------------------------------------

resource "aws_db_parameter_group" "postgres" {
  name        = "${var.project}-${var.environment}-postgres-params"
  family      = "postgres16"
  description = "PostgreSQL parameters tuned for ${var.project} high concurrency"

  # Maximum client connections (adjusted per instance class)
  parameter {
    name  = "max_connections"
    value = "200"
  }

  # Shared buffer cache – 25% of instance RAM is the recommended starting point
  parameter {
    name  = "shared_buffers"
    value = "{DBInstanceClassMemory/4}"
  }

  # Effective cache size – total RAM available for OS + DB caching
  parameter {
    name  = "effective_cache_size"
    value = "{DBInstanceClassMemory*3/4}"
  }

  # Work memory per sort/hash operation
  parameter {
    name  = "work_mem"
    value = "16384" # 16 MB
  }

  # WAL level – minimal for read replicas, logical for CDC
  parameter {
    name         = "wal_level"
    value        = "logical"
    apply_method = "pending-reboot"
  }

  # Connection keepalive
  parameter {
    name  = "tcp_keepalives_idle"
    value = "60"
  }

  parameter {
    name  = "tcp_keepalives_interval"
    value = "10"
  }

  parameter {
    name  = "tcp_keepalives_count"
    value = "6"
  }

  # SSL enforcement
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -----------------------------------------------------------------------------
# RDS Instance
# -----------------------------------------------------------------------------

resource "aws_db_instance" "main" {
  identifier = "${var.project}-${var.environment}-postgres"

  # Engine
  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  # Storage (encrypted at rest)
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  # Credentials
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # High availability
  multi_az = var.db_multi_az

  # Backups
  backup_retention_period   = var.db_backup_retention_period
  backup_window             = "02:00-03:00" # UTC – before AWS Backup daily run
  maintenance_window        = "sun:04:00-sun:05:00"
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false

  # Performance / monitoring
  parameter_group_name                  = aws_db_parameter_group.postgres.name
  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.rds.arn
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                   = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  # Security
  auto_minor_version_upgrade  = true
  deletion_protection         = var.environment == "production"
  skip_final_snapshot         = var.environment != "production"
  final_snapshot_identifier   = "${var.project}-${var.environment}-final-snapshot"

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  lifecycle {
    # Prevent accidental destruction in production
    prevent_destroy = false # Set to true after initial deployment
    ignore_changes  = [password] # Managed by Secrets Manager rotation
  }
}

# -----------------------------------------------------------------------------
# IAM Role for Enhanced Monitoring
# -----------------------------------------------------------------------------

data "aws_iam_policy_document" "rds_monitoring_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["monitoring.rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_monitoring" {
  name               = "${var.project}-${var.environment}-rds-monitoring-role"
  assume_role_policy = data.aws_iam_policy_document.rds_monitoring_assume.json

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "db_instance_id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}

output "db_instance_arn" {
  description = "RDS instance ARN (used by AWS Backup selection)"
  value       = aws_db_instance.main.arn
}

output "db_endpoint" {
  description = "RDS endpoint address"
  value       = aws_db_instance.main.address
  sensitive   = true
}

output "db_port" {
  description = "RDS port"
  value       = aws_db_instance.main.port
}

output "db_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret containing DB credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "rds_security_group_id" {
  description = "ID of the RDS security group"
  value       = aws_security_group.rds.id
}

output "rds_kms_key_arn" {
  description = "ARN of the KMS key used to encrypt the RDS instance"
  value       = aws_kms_key.rds.arn
}
