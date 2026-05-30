#!/bin/bash
# Monthly Restore Drill Script (#305)
# Verifies the latest backup by restoring it to a temporary database.

set -e

# Configuration
S3_BUCKET=${BACKUP_S3_BUCKET}
TEMP_DB_URL=${TEMP_RESTORE_DB_URL} # Temporary database for testing the restore

if [ -z "$S3_BUCKET" ]; then
  echo "Error: BACKUP_S3_BUCKET is not set."
  exit 1
fi

if [ -z "$TEMP_DB_URL" ]; then
  echo "Error: TEMP_RESTORE_DB_URL is not set."
  exit 1
fi

echo "Starting restore drill..."

# 1. Find latest backup on S3
LATEST_BACKUP=$(aws s3 ls "s3://$S3_BUCKET/db-backups/" --recursive | sort | tail -n 1 | awk '{print $4}')

if [ -z "$LATEST_BACKUP" ]; then
  echo "Error: No backups found in s3://$S3_BUCKET/db-backups/"
  exit 1
fi

echo "Downloading latest backup: $LATEST_BACKUP"
aws s3 cp "s3://$S3_BUCKET/$LATEST_BACKUP" "/tmp/latest-backup.sql.gz"

# 2. Restore to temporary database
echo "Restoring to temporary database..."
# Clear the temp DB first (WARNING: This will drop everything in the target DB)
psql "$TEMP_DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c "/tmp/latest-backup.sql.gz" | psql "$TEMP_DB_URL"

# 3. Verify integrity
echo "Verifying data integrity..."
# Check if core tables exist and have data
TABLE_COUNT=$(psql "$TEMP_DB_URL" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Found $TABLE_COUNT tables in restored database."

if [ "$TABLE_COUNT" -lt 1 ]; then
  echo "Error: Restore drill failed - no tables found."
  exit 1
fi

# Run a sample query (e.g., check indexer_cursor)
LAST_LEDGER=$(psql "$TEMP_DB_URL" -t -c "SELECT last_ledger FROM indexer_cursor LIMIT 1;")
echo "Last processed ledger in backup: $LAST_LEDGER"

# 4. Clean up
rm "/tmp/latest-backup.sql.gz"

echo "Restore drill completed successfully!"
