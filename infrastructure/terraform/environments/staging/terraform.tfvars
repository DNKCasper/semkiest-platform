# =============================================================================
# SemkiEst Platform – Staging Environment Variables
# =============================================================================

# Global
project     = "semkiest"
environment = "staging"
aws_region  = "us-east-1"

tags = {
  Owner      = "platform-team"
  CostCenter = "engineering"
}

# VPC
vpc_cidr = "10.0.0.0/16"
availability_zones = [
  "us-east-1a",
  "us-east-1b",
]
public_subnet_cidrs = [
  "10.0.1.0/24",
  "10.0.2.0/24",
]
private_subnet_cidrs = [
  "10.0.11.0/24",
  "10.0.12.0/24",
]
database_subnet_cidrs = [
  "10.0.21.0/24",
  "10.0.22.0/24",
]

# Cost optimisation: single NAT gateway in staging
single_nat_gateway = true

# ECS – API
ecs_api_cpu           = 256
ecs_api_memory        = 512
ecs_api_desired_count = 1
ecs_api_min_count     = 1
ecs_api_max_count     = 3

# ECS – Worker
ecs_worker_cpu           = 256
ecs_worker_memory        = 512
ecs_worker_desired_count = 1
ecs_worker_min_count     = 1
ecs_worker_max_count     = 2

# Image URIs – updated by CI/CD pipeline
ecr_api_image_uri    = "public.ecr.aws/nginx/nginx:latest"
ecr_worker_image_uri = "public.ecr.aws/nginx/nginx:latest"

# RDS
rds_instance_class         = "db.t3.micro"
rds_engine_version         = "15.4"
rds_allocated_storage      = 20
rds_max_allocated_storage  = 50
rds_database_name          = "semkiest"
rds_multi_az               = false
rds_backup_retention_days  = 3
rds_deletion_protection    = false

# Redis
redis_node_type                = "cache.t3.micro"
redis_engine_version           = "7.0"
redis_num_cache_nodes          = 1
redis_snapshot_retention_limit = 1

# S3
s3_uploads_bucket_name                = "semkiest-staging-uploads"
s3_artifacts_bucket_name              = "semkiest-staging-artifacts"
s3_logs_bucket_name                   = "semkiest-staging-logs"
s3_noncurrent_version_expiration_days = 14

# CloudFront
cloudfront_price_class     = "PriceClass_100"
cloudfront_custom_domain   = ""
cloudfront_acm_certificate_arn = ""

# Secrets Manager
secrets_recovery_window_days = 7
