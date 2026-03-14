# =============================================================================
# Terraform remote state backend – Staging
# =============================================================================
# Usage:
#   terraform init -backend-config=environments/staging/backend.hcl
# =============================================================================

bucket         = "semkiest-terraform-state-800444474190"
key            = "staging/terraform.tfstate"
region         = "us-east-1"
dynamodb_table = "semkiest-terraform-locks"
encrypt        = true
