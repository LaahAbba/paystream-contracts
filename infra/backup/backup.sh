#!/bin/bash
# PostgreSQL Backup Script (#305)
# Performs a full dump and uploads to S3.

set -e

# Configuration
DB_URL=${DATABASE_URL}
S3_BUCKET=${BACKUP_S3_BUCKET}
S3_PATH="db-backups/$(date +%Y/%m/%d)"
FILENAME="paystream-db-$(date +%Y%m%d-%H%M%S).sql.gz"
RETENTION_DAYS=30

if [ -z "$DB_URL" ]; then
  echo "Error: DATABASE_URL is not set."
  exit 1
fi

if [ -z "$S3_BUCKET" ]; then
  echo "Error: BACKUP_S3_BUCKET is not set."
  exit 1
fi

echo "Starting backup: $FILENAME"

# 1. Create dump
pg_dump "$DB_URL" | gzip > "/tmp/$FILENAME"

# 2. Upload to S3
aws s3 cp "/tmp/$FILENAME" "s3://$S3_BUCKET/$S3_PATH/$FILENAME"

# 3. Clean up local file
rm "/tmp/$FILENAME"

echo "Backup uploaded successfully: s3://$S3_BUCKET/$S3_PATH/$FILENAME"

# 4. Optional: Local cleanup of old backups if running on a persistent server
# (For S3, we recommend using S3 Lifecycle Policies for retention)
# aws s3 ls "s3://$S3_BUCKET/db-backups/" --recursive | ...
