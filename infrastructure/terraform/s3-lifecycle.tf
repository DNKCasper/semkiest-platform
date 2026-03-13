# =============================================================================
# SemkiEst Platform – S3 Lifecycle Policies
#
# Configures object lifecycle rules on the application S3 bucket:
#   - Artifacts deleted after 90 days (configurable)
#   - Incomplete multipart uploads cleaned up after 7 days
#   - Non-current versions transitioned to cheaper storage then deleted
# =============================================================================

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "s3_bucket_name" {
  description = "Name of the main application S3 bucket"
  type        = string
}

variable "artifact_retention_days" {
  description = "Days before artifact objects are permanently deleted"
  type        = number
  default     = 90
}

variable "noncurrent_version_transition_days" {
  description = "Days before non-current versions are transitioned to Glacier Instant Retrieval"
  type        = number
  default     = 30
}

variable "noncurrent_version_expiration_days" {
  description = "Days before non-current versions are permanently deleted"
  type        = number
  default     = 60
}

# -----------------------------------------------------------------------------
# Data Source – reference the existing bucket
# -----------------------------------------------------------------------------

data "aws_s3_bucket" "main" {
  bucket = var.s3_bucket_name
}

# -----------------------------------------------------------------------------
# Bucket Versioning (required for non-current version rules)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket_versioning" "main" {
  bucket = data.aws_s3_bucket.main.id

  versioning_configuration {
    status = "Enabled"
  }
}

# -----------------------------------------------------------------------------
# Lifecycle Configuration
# -----------------------------------------------------------------------------

resource "aws_s3_bucket_lifecycle_configuration" "main" {
  bucket = data.aws_s3_bucket.main.id

  # Ensure versioning is enabled before applying lifecycle rules
  depends_on = [aws_s3_bucket_versioning.main]

  # ── Rule 1: Artifact expiration ──────────────────────────────────────────
  rule {
    id     = "artifact-expiration"
    status = "Enabled"

    filter {
      prefix = "artifacts/"
    }

    expiration {
      days = var.artifact_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }
  }

  # ── Rule 2: Test result expiration ───────────────────────────────────────
  rule {
    id     = "test-results-expiration"
    status = "Enabled"

    filter {
      prefix = "test-results/"
    }

    expiration {
      days = var.artifact_retention_days
    }
  }

  # ── Rule 3: Log archive expiration ───────────────────────────────────────
  rule {
    id     = "log-archive-expiration"
    status = "Enabled"

    filter {
      prefix = "logs/"
    }

    # Transition logs to cheaper storage before deletion
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 60
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = var.artifact_retention_days
    }
  }

  # ── Rule 4: Non-current version lifecycle (all prefixes) ─────────────────
  rule {
    id     = "noncurrent-version-lifecycle"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_transition {
      noncurrent_days = var.noncurrent_version_transition_days
      storage_class   = "GLACIER_IR"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }
  }

  # ── Rule 5: Incomplete multipart upload cleanup ───────────────────────────
  rule {
    id     = "incomplete-multipart-cleanup"
    status = "Enabled"

    filter {
      prefix = ""
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# -----------------------------------------------------------------------------
# Server-Side Encryption (enforce AES-256 at rest)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = data.aws_s3_bucket.main.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_kms_key" "s3" {
  description             = "${var.project} ${var.environment} S3 encryption key"
  deletion_window_in_days = 14
  enable_key_rotation     = true

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "s3" {
  name          = "alias/${var.project}-${var.environment}-s3"
  target_key_id = aws_kms_key.s3.key_id
}

# -----------------------------------------------------------------------------
# Block Public Access
# -----------------------------------------------------------------------------

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = data.aws_s3_bucket.main.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "s3_bucket_id" {
  description = "ID of the application S3 bucket"
  value       = data.aws_s3_bucket.main.id
}

output "s3_kms_key_arn" {
  description = "ARN of the KMS key used to encrypt S3 objects"
  value       = aws_kms_key.s3.arn
}
