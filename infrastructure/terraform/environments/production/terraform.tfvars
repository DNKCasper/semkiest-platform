# =============================================================================
# SemkiEst Platform – Production Environment Variables
# =============================================================================

# Global
project     = "semkiest"
environment = "production"
aws_region  = "us-east-1"

tags = {
  Owner      = "platform-team"
  CostCenter = "engineering"
}

# VPC – three AZs for maximum availability
vpc_cidr = "10.1.0.0/16"
availability_zones = [
  "us-east-1a",
  "us-east-1b",
  "us-east-1c",
]
public_subnet_cidrs = [
  "10.1.1.0/24",
  "10.1.2.0/24",
  "10.1.3.0/24",
]
private_subnet_cidrs = [
  "10.1.11.0/24",
  "10.1.12.0/24",
  "10.1.13.0/24",
]
database_subnet_cidrs = [
  "10.1.21.0/24",
  "10.1.22.0/24",
  "10.1.23.0/24",
]

# Production: one NAT gateway per AZ for HA
single_nat_gateway = false

# ECS – API
ecs_api_cpu           = 1024
ecs_api_memory        = 2048
ecs_api_desired_count = 2
ecs_api_min_count     = 2
ecs_api_max_count     = 10

# ECS – Worker
ecs_worker_cpu           = 512
ecs_worker_memory        = 1024
ecs_worker_desired_count = 2
ecs_worker_min_count     = 1
ecs_worker_max_count     = 5

# Image URIs – updated by CI/CD pipeline
ecr_api_image_uri    = "public.ecr.aws/nginx/nginx:latest"
ecr_worker_image_uri = "public.ecr.aws/nginx/nginx:latest"

# RDS – Multi-AZ for high availability
rds_instance_class         = "db.t3.medium"
rds_engine_version         = "16.6"
rds_allocated_storage      = 50
rds_max_allocated_storage  = 500
rds_database_name          = "semkiest"
rds_multi_az               = true
rds_backup_retention_days  = 14
rds_deletion_protection    = true

# Redis
redis_node_type                = "cache.t3.small"
redis_engine_version           = "7.0"
redis_num_cache_nodes          = 1
redis_snapshot_retention_limit = 5

# S3
s3_uploads_bucket_name                = "semkiest-production-uploads"
s3_artifacts_bucket_name              = "semkiest-production-artifacts"
s3_logs_bucket_name                   = "semkiest-production-logs"
s3_noncurrent_version_expiration_days = 30

# CloudFront
cloudfront_price_class     = "PriceClass_All"
# Replace with real domain + ACM certificate ARN before deploying:
cloudfront_custom_domain        = "cdn.semkiest.com"
cloudfront_acm_certificate_arn  = "arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"

# Secrets Manager
secrets_recovery_window_days = 30
