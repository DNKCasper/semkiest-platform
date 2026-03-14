# =============================================================================
# Terraform remote state backend – Production
# =============================================================================
# Usage:
#   terraform init -backend-config=environments/production/backend.hcl
# =============================================================================

bucket         = "semkiest-terraform-state-800444474190"
key            = "production/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "semkiest-terraform-locks"
encrypt        = true
