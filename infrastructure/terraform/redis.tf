# =============================================================================
# SemkiEst Platform – ElastiCache Redis
# =============================================================================
# Single-node by default (cost optimised for staging).
# Upgrade to a replication group with read replicas for production.
# =============================================================================

# -----------------------------------------------------------------------------
# Generate random auth token (Redis AUTH)
# -----------------------------------------------------------------------------

resource "random_password" "redis_auth" {
  length  = 32
  special = false # Redis AUTH token must be alphanumeric
}

# -----------------------------------------------------------------------------
# ElastiCache Cluster (single-node / non-clustered mode)
# -----------------------------------------------------------------------------

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  engine_version       = var.redis_engine_version
  node_type            = var.redis_node_type
  num_cache_nodes      = var.redis_num_cache_nodes
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  port                 = 6379

  # Maintenance & snapshots
  maintenance_window       = "sun:05:00-sun:06:00"
  snapshot_retention_limit = var.redis_snapshot_retention_limit
  snapshot_window          = "03:00-04:00"

  # Encryption in transit (TLS) and at rest
  az_mode = var.redis_num_cache_nodes > 1 ? "cross-az" : "single-az"

  # Apply changes immediately (acceptable for non-production; set to false for production)
  apply_immediately = var.environment != "production"

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}

# -----------------------------------------------------------------------------
# Parameter Group
# -----------------------------------------------------------------------------

resource "aws_elasticache_parameter_group" "main" {
  name        = "${local.name_prefix}-redis7"
  family      = "redis7"
  description = "Redis 7 parameter group for ${local.name_prefix}"

  # Increase maxmemory-samples for better LRU approximation
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = {
    Name = "${local.name_prefix}-redis7"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# -----------------------------------------------------------------------------
# CloudWatch Alarms – Redis
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "redis_cpu_high" {
  alarm_name          = "${local.name_prefix}-redis-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Redis CPU utilization exceeded 80% for 10 minutes"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.main.cluster_id
  }

  tags = {
    Name = "${local.name_prefix}-redis-cpu-alarm"
  }
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_high" {
  alarm_name          = "${local.name_prefix}-redis-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  alarm_description   = "Redis memory usage exceeded 85%"

  dimensions = {
    CacheClusterId = aws_elasticache_cluster.main.cluster_id
  }

  tags = {
    Name = "${local.name_prefix}-redis-memory-alarm"
  }
}
