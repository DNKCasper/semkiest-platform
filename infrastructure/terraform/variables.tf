# =============================================================================
# SemkiEst Platform – Terraform Variables
# =============================================================================

# -----------------------------------------------------------------------------
# Global
# -----------------------------------------------------------------------------

variable "project" {
  description = "Project name used as a prefix for all resources."
  type        = string
  default     = "semkiest"
}

variable "environment" {
  description = "Deployment environment (staging | production)."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be 'staging' or 'production'."
  }
}

variable "aws_region" {
  description = "AWS region to deploy resources in."
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Additional tags applied to all taggable resources."
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# VPC / Networking
# -----------------------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to use (must be >= 2)."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets, one per AZ."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets, one per AZ."
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for isolated database subnets, one per AZ."
  type        = list(string)
  default     = ["10.0.21.0/24", "10.0.22.0/24", "10.0.23.0/24"]
}

variable "single_nat_gateway" {
  description = "When true, deploy a single NAT gateway instead of one per AZ. Reduces cost in non-production environments."
  type        = bool
  default     = false
}

# -----------------------------------------------------------------------------
# ECS
# -----------------------------------------------------------------------------

variable "ecs_api_cpu" {
  description = "CPU units for the API ECS task (1024 = 1 vCPU)."
  type        = number
  default     = 512
}

variable "ecs_api_memory" {
  description = "Memory (MiB) for the API ECS task."
  type        = number
  default     = 1024
}

variable "ecs_api_desired_count" {
  description = "Desired number of API task replicas."
  type        = number
  default     = 2
}

variable "ecs_api_min_count" {
  description = "Minimum number of API task replicas for auto-scaling."
  type        = number
  default     = 1
}

variable "ecs_api_max_count" {
  description = "Maximum number of API task replicas for auto-scaling."
  type        = number
  default     = 10
}

variable "ecs_worker_cpu" {
  description = "CPU units for the worker ECS task."
  type        = number
  default     = 512
}

variable "ecs_worker_memory" {
  description = "Memory (MiB) for the worker ECS task."
  type        = number
  default     = 1024
}

variable "ecs_worker_desired_count" {
  description = "Desired number of worker task replicas."
  type        = number
  default     = 1
}

variable "ecs_worker_min_count" {
  description = "Minimum number of worker task replicas for auto-scaling."
  type        = number
  default     = 1
}

variable "ecs_worker_max_count" {
  description = "Maximum number of worker task replicas for auto-scaling."
  type        = number
  default     = 5
}

variable "ecr_api_image_uri" {
  description = "Full ECR image URI for the API service (e.g. 123456789.dkr.ecr.us-east-1.amazonaws.com/semkiest-api:latest)."
  type        = string
  default     = "public.ecr.aws/nginx/nginx:latest" # placeholder; overridden via tfvars
}

variable "ecr_worker_image_uri" {
  description = "Full ECR image URI for the worker service."
  type        = string
  default     = "public.ecr.aws/nginx/nginx:latest" # placeholder; overridden via tfvars
}

# -----------------------------------------------------------------------------
# RDS PostgreSQL
# -----------------------------------------------------------------------------

variable "rds_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t3.medium"
}

variable "rds_engine_version" {
  description = "PostgreSQL engine version."
  type        = string
  default     = "15.4"
}

variable "rds_allocated_storage" {
  description = "Initial allocated storage in GiB."
  type        = number
  default     = 20
}

variable "rds_max_allocated_storage" {
  description = "Maximum storage autoscaling ceiling in GiB."
  type        = number
  default     = 100
}

variable "rds_database_name" {
  description = "Name of the initial database to create."
  type        = string
  default     = "semkiest"
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for high availability (recommended for production)."
  type        = bool
  default     = false
}

variable "rds_backup_retention_days" {
  description = "Number of days to retain automated backups."
  type        = number
  default     = 7
}

variable "rds_backup_window" {
  description = "Preferred backup window (UTC), e.g. '02:00-03:00'."
  type        = string
  default     = "02:00-03:00"
}

variable "rds_maintenance_window" {
  description = "Preferred maintenance window, e.g. 'Mon:04:00-Mon:05:00'."
  type        = string
  default     = "Mon:04:00-Mon:05:00"
}

variable "rds_deletion_protection" {
  description = "Enable deletion protection on the RDS instance."
  type        = bool
  default     = true
}

# -----------------------------------------------------------------------------
# ElastiCache Redis
# -----------------------------------------------------------------------------

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_engine_version" {
  description = "Redis engine version."
  type        = string
  default     = "7.0"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes (1 = single node, >1 = cluster)."
  type        = number
  default     = 1
}

variable "redis_snapshot_retention_limit" {
  description = "Number of days to retain Redis snapshots (0 to disable)."
  type        = number
  default     = 3
}

# -----------------------------------------------------------------------------
# S3
# -----------------------------------------------------------------------------

variable "s3_uploads_bucket_name" {
  description = "Name of the S3 bucket for user uploads and screenshots. Must be globally unique."
  type        = string
  # Override in environment tfvars
}

variable "s3_artifacts_bucket_name" {
  description = "Name of the S3 bucket for build artifacts and reports. Must be globally unique."
  type        = string
  # Override in environment tfvars
}

variable "s3_logs_bucket_name" {
  description = "Name of the S3 bucket for access logs. Must be globally unique."
  type        = string
  # Override in environment tfvars
}

variable "s3_noncurrent_version_expiration_days" {
  description = "Days before non-current object versions are expired."
  type        = number
  default     = 30
}

# -----------------------------------------------------------------------------
# CloudFront
# -----------------------------------------------------------------------------

variable "cloudfront_price_class" {
  description = "CloudFront price class (PriceClass_All | PriceClass_200 | PriceClass_100)."
  type        = string
  default     = "PriceClass_100"
}

variable "cloudfront_custom_domain" {
  description = "Optional custom domain for the CloudFront distribution (e.g. cdn.semkiest.com). Leave empty to use the default CloudFront domain."
  type        = string
  default     = ""
}

variable "cloudfront_acm_certificate_arn" {
  description = "ARN of an ACM certificate in us-east-1 for the custom domain. Required when cloudfront_custom_domain is set."
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# Secrets Manager
# -----------------------------------------------------------------------------

variable "secrets_recovery_window_days" {
  description = "Days before a deleted secret is permanently removed (7–30)."
  type        = number
  default     = 7
}
