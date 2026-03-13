# Infrastructure – SemkiEst Platform

Terraform configuration for deploying the SemkiEst platform to AWS.

## Architecture Overview

```
                   ┌──────────────────────────────────────────┐
                   │                  VPC                     │
  Internet ──────► │  ┌──────────┐    ┌──────────────────┐   │
                   │  │  ALB     │──► │  Private Subnets  │   │
                   │  │ (public) │    │  ┌────────────┐   │   │
                   │  └──────────┘    │  │ ECS API    │   │   │
                   │                  │  │ ECS Worker │   │   │
  CloudFront ────► │  S3 (uploads)    │  └─────┬──────┘   │   │
                   │                  │        │           │   │
                   │                  │  ┌─────▼──────┐   │   │
                   │                  │  │ DB Subnets │   │   │
                   │                  │  │ RDS / Redis│   │   │
                   │                  │  └────────────┘   │   │
                   │                  └──────────────────┘   │
                   └──────────────────────────────────────────┘
```

## Resources

| Resource | Description |
|---|---|
| VPC | 3-tier with public / private / database subnets |
| Security Groups | Least-privilege rules per tier |
| NAT Gateways | One per AZ (staging: one shared) |
| ECS Fargate | API + Worker services with auto-scaling |
| ECR | Private image registries for API and worker |
| ALB | HTTPS termination, HTTP→HTTPS redirect |
| RDS PostgreSQL 15 | Multi-AZ in production, automated backups |
| ElastiCache Redis 7 | Session storage and BullMQ queues |
| S3 | Uploads, artifacts, and access logs |
| CloudFront | CDN for uploads bucket, optional custom domain |
| Secrets Manager | DATABASE_URL, REDIS_URL, JWT_SECRET, RDS/Redis creds |
| IAM | Task execution role + per-service task roles |
| CloudWatch | Log groups + metric alarms |

## Prerequisites

1. Terraform ≥ 1.6.0
2. AWS CLI configured with appropriate credentials
3. Remote state backend bootstrapped (see `bootstrap/README.md`)

## Usage

### Staging

```bash
cd infrastructure/terraform

# First-time setup
terraform init -backend-config=environments/staging/backend.hcl

# Plan
terraform plan -var-file=environments/staging/terraform.tfvars

# Apply
terraform apply -var-file=environments/staging/terraform.tfvars
```

### Production

```bash
cd infrastructure/terraform

terraform init -backend-config=environments/production/backend.hcl
terraform plan -var-file=environments/production/terraform.tfvars
terraform apply -var-file=environments/production/terraform.tfvars
```

## File Structure

```
infrastructure/terraform/
├── main.tf           # Provider and backend configuration
├── variables.tf      # All input variable declarations
├── outputs.tf        # All outputs (ARNs, endpoints, etc.)
├── vpc.tf            # VPC, subnets, routing, security groups
├── ecs.tf            # ECS cluster, ECR, ALB, task definitions, services
├── rds.tf            # RDS PostgreSQL instance
├── redis.tf          # ElastiCache Redis cluster
├── s3.tf             # S3 buckets (uploads, artifacts, logs)
├── cloudfront.tf     # CloudFront distribution
├── iam.tf            # IAM roles and policies
├── secrets.tf        # Secrets Manager secrets
├── environments/
│   ├── staging/
│   │   ├── terraform.tfvars
│   │   └── backend.hcl
│   └── production/
│       ├── terraform.tfvars
│       └── backend.hcl
└── bootstrap/
    └── README.md     # One-time state backend setup instructions
```

## Updating Application Secrets

After the initial `terraform apply`, update application secrets with real values:

```bash
# Retrieve the secret ARN from outputs
SECRET_ARN=$(terraform output -raw app_secrets_arn)

# Update with real values
aws secretsmanager put-secret-value \
  --secret-id "${SECRET_ARN}" \
  --secret-string '{
    "DATABASE_URL": "postgresql://semkiest_admin:<password>@<rds-host>:5432/semkiest?schema=public",
    "REDIS_URL": "redis://:<auth-token>@<redis-host>:6379",
    "JWT_SECRET": "<generate-with: openssl rand -base64 32>",
    "INTERNAL_API_KEY": "<generate-with: openssl rand -hex 32>"
  }'
```

## Deploying a New Image

The ECS service `task_definition` and `desired_count` are ignored by Terraform to allow the CI/CD pipeline to manage deployments independently. To deploy a new image:

```bash
aws ecs update-service \
  --cluster semkiest-<env>-cluster \
  --service semkiest-<env>-api \
  --force-new-deployment
```
