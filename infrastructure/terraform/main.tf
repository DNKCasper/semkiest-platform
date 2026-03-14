# =============================================================================
# SemkiEst Platform – Terraform Root Module
# =============================================================================
# This file declares the Terraform and provider requirements and sets up the
# remote state backend.  All resources are defined in purpose-specific files
# (vpc.tf, ecs.tf, rds.tf, redis.tf, s3.tf, cloudfront.tf, iam.tf).
# =============================================================================

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Remote state backend – configure the bucket / key per environment via
  # partial configuration or environment-specific backend config files.
  # Example:
  #   terraform init -backend-config=environments/production/backend.hcl
  backend "s3" {
    # These values must be supplied at `terraform init` time via -backend-config
    # or an environment-specific backend.hcl file.
    # bucket         = "semkiest-terraform-state-<account-id>"
    # key            = "<environment>/terraform.tfstate"
    # region         = "us-east-1"
    # dynamodb_table = "semkiest-terraform-locks"
    # encrypt        = true
  }
}

# -----------------------------------------------------------------------------
# Provider
# -----------------------------------------------------------------------------

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Project     = var.project
        Environment = var.environment
        ManagedBy   = "terraform"
        Repository  = "semkiest-platform"
      },
      var.tags,
    )
  }
}

# us-east-1 provider alias — required for ACM certificates used by CloudFront.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = merge(
      {
        Project     = var.project
        Environment = var.environment
        ManagedBy   = "terraform"
        Repository  = "semkiest-platform"
      },
      var.tags,
    )
  }
}

# -----------------------------------------------------------------------------
# Local values shared across modules
# -----------------------------------------------------------------------------

locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = {
    Project     = var.project
    Environment = var.environment
  }
}
