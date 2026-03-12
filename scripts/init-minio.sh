#!/bin/sh
set -e

# Wait for MinIO to be ready
until mc alias set local http://minio:9000 semkiest semkiest123; do
  echo "Waiting for MinIO..."
  sleep 2
done

# Create buckets
for bucket in screenshots baselines reports; do
  mc mb --ignore-existing local/$bucket
  echo "Bucket $bucket ready"
done

echo "MinIO initialization complete"
