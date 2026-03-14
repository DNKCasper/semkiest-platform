# =============================================================================
# SemkiEst Platform – S3 Buckets
# =============================================================================
# Three buckets:
#   • uploads   – user uploads, screenshots, baselines (private, served via CF)
#   • artifacts – build artifacts, test reports
#   • logs      – S3 server-access logs (separate bucket per AWS recommendation)
# =============================================================================

# -----------------------------------------------------------------------------
# Logs bucket  (must exist before other buckets can log to it)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "logs" {
  bucket        = var.s3_logs_bucket_name
  force_destroy = var.environment != "production"

  tags = {
    Name    = var.s3_logs_bucket_name
    Purpose = "access-logs"
  }
}

resource "aws_s3_bucket_ownership_controls" "logs" {
  bucket = aws_s3_bucket.logs.id
  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "logs" {
  depends_on = [aws_s3_bucket_ownership_controls.logs]
  bucket     = aws_s3_bucket.logs.id
  acl        = "log-delivery-write"
}

resource "aws_s3_bucket_lifecycle_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    id     = "expire-old-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logs" {
  bucket = aws_s3_bucket.logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -----------------------------------------------------------------------------
# Uploads bucket (user files, screenshots, baselines)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "uploads" {
  bucket        = var.s3_uploads_bucket_name
  force_destroy = var.environment != "production"

  tags = {
    Name    = var.s3_uploads_bucket_name
    Purpose = "uploads"
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "uploads" {
  bucket        = aws_s3_bucket.uploads.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access-logs/uploads/"
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.s3_noncurrent_version_expiration_days
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# CORS configuration – required for browser-direct uploads
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["*"] # Restrict to app domain in production via tfvars or a dynamic reference
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Bucket policy – only CloudFront OAC and ECS task role can read objects
resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads_bucket_policy.json

  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

data "aws_iam_policy_document" "uploads_bucket_policy" {
  # CloudFront OAC – read objects for CDN delivery
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }

  # Deny HTTP (non-HTTPS) access
  statement {
    sid    = "DenyNonSSL"
    effect = "Deny"
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

# -----------------------------------------------------------------------------
# Artifacts bucket (build artifacts, test reports)
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "artifacts" {
  bucket        = var.s3_artifacts_bucket_name
  force_destroy = var.environment != "production"

  tags = {
    Name    = var.s3_artifacts_bucket_name
    Purpose = "artifacts"
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_logging" "artifacts" {
  bucket        = aws_s3_bucket.artifacts.id
  target_bucket = aws_s3_bucket.logs.id
  target_prefix = "s3-access-logs/artifacts/"
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.s3_noncurrent_version_expiration_days
    }
  }

  rule {
    id     = "transition-old-reports-to-ia"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    expiration {
      days = 365
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = data.aws_iam_policy_document.artifacts_bucket_policy.json

  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

data "aws_iam_policy_document" "artifacts_bucket_policy" {
  statement {
    sid    = "DenyNonSSL"
    effect = "Deny"
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
