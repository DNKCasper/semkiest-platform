# Terraform Bootstrap

Before using the Terraform configuration you need to create the S3 bucket and DynamoDB table used for remote state storage. Run the following commands once per AWS account:

```bash
# Replace ACCOUNT_ID and REGION as needed
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1

# S3 bucket for state files
aws s3api create-bucket \
  --bucket "semkiest-terraform-state-${ACCOUNT_ID}" \
  --region "${REGION}"

aws s3api put-bucket-versioning \
  --bucket "semkiest-terraform-state-${ACCOUNT_ID}" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "semkiest-terraform-state-${ACCOUNT_ID}" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

aws s3api put-public-access-block \
  --bucket "semkiest-terraform-state-${ACCOUNT_ID}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# DynamoDB table for state locking
aws dynamodb create-table \
  --table-name semkiest-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}"
```

After bootstrapping, update `environments/staging/backend.hcl` and `environments/production/backend.hcl` with the correct account ID.
