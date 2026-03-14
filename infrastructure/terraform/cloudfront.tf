# =============================================================================
# SemkiEst Platform – CloudFront Distribution
# =============================================================================
# Serves static assets from the uploads S3 bucket via CloudFront CDN.
# Uses Origin Access Control (OAC) for secure S3 access.
# =============================================================================

# -----------------------------------------------------------------------------
# Origin Access Control (replaces the legacy Origin Access Identity)
# -----------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "uploads" {
  name                              = "${local.name_prefix}-uploads-oac"
  description                       = "OAC for ${local.name_prefix} uploads S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# -----------------------------------------------------------------------------
# Cache policies
# -----------------------------------------------------------------------------

# Default managed cache policy (CachingOptimized)
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# Managed origin request policy (CORS-S3Origin)
data "aws_cloudfront_origin_request_policy" "cors_s3" {
  name = "Managed-CORS-S3Origin"
}

# -----------------------------------------------------------------------------
# CloudFront Distribution
# -----------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = "${local.name_prefix} – static assets CDN"
  default_root_object = ""
  price_class         = var.cloudfront_price_class
  http_version        = "http2and3"
  is_ipv6_enabled     = true

  # Custom domain (optional)
  aliases = var.cloudfront_custom_domain != "" ? [var.cloudfront_custom_domain] : []

  # -----------------------------------------------------------------------
  # Origin – S3 uploads bucket
  # -----------------------------------------------------------------------
  origin {
    domain_name              = aws_s3_bucket.uploads.bucket_regional_domain_name
    origin_id                = "s3-uploads"
    origin_access_control_id = aws_cloudfront_origin_access_control.uploads.id
  }

  # -----------------------------------------------------------------------
  # Default cache behaviour
  # -----------------------------------------------------------------------
  default_cache_behavior {
    target_origin_id       = "s3-uploads"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3.id
  }

  # -----------------------------------------------------------------------
  # Geo-restriction (none by default)
  # -----------------------------------------------------------------------
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # -----------------------------------------------------------------------
  # TLS/SSL
  # -----------------------------------------------------------------------
  viewer_certificate {
    acm_certificate_arn            = var.cloudfront_custom_domain != "" && var.cloudfront_acm_certificate_arn != "" ? var.cloudfront_acm_certificate_arn : null
    ssl_support_method             = var.cloudfront_custom_domain != "" && var.cloudfront_acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = var.cloudfront_custom_domain != "" && var.cloudfront_acm_certificate_arn != "" ? "TLSv1.2_2021" : "TLSv1"
    cloudfront_default_certificate = var.cloudfront_custom_domain == ""
  }

  # -----------------------------------------------------------------------
  # Access logging
  # -----------------------------------------------------------------------
  logging_config {
    bucket          = aws_s3_bucket.logs.bucket_domain_name
    prefix          = "cloudfront/"
    include_cookies = false
  }

  tags = {
    Name = "${local.name_prefix}-cloudfront"
  }

  depends_on = [
    aws_s3_bucket.uploads,
    aws_s3_bucket.logs,
  ]
}
