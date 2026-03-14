# =============================================================================
# Terraform remote state backend – Production
# =============================================================================
# Usage:
#   terraform init -backend-config=environments/production/backend.hcl
# =============================================================================

# Replace ACCOUNT_ID with your AWS account ID before running.
bucket         = "semkiest-terraform-state-ACCOUNT_ID"
key            = "production/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "semkiest-terraform-locks"
encrypt        = true
