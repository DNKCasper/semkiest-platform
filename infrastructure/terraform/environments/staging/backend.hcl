# =============================================================================
# Terraform remote state backend – Staging
# =============================================================================
# Usage:
#   terraform init -backend-config=environments/staging/backend.hcl
# =============================================================================

# Replace ACCOUNT_ID with your AWS account ID before running.
bucket         = "semkiest-terraform-state-ACCOUNT_ID"
key            = "staging/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "semkiest-terraform-locks"
encrypt        = true
