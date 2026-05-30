# Disaster Recovery Runbook

Authoritative procedure for restoring PayStream services after a major incident.

**RTO target:** 4 hours  
**RPO target:** 1 hour

---

## Scope

This runbook covers full-service restoration for:
- API layer (ECS tasks)
- PostgreSQL database (RDS)
- Redis cache (ElastiCache)
- Stellar contract state (on-chain — immutable by design)

Stellar contract state lives on-chain and is not subject to DR in the traditional sense. This runbook focuses on off-chain infrastructure.

---

## Severity Triage

Before following this runbook, confirm the incident qualifies as a disaster (not a partial outage):

| Signal | Action |
|---|---|
| All environments unreachable | Follow this runbook |
| Single service degraded | Use service-specific playbook |
| Data corruption detected | Escalate to engineering lead before proceeding |
| Backup unavailable | See [Backup Unavailable](#backup-unavailable) |

---

## On-Call Contacts

| Role | Contact |
|---|---|
| Primary on-call | Paged via alerting system |
| Engineering lead | Listed in internal contacts doc |
| AWS support | Console → Support Center |
| Stellar network status | <https://status.stellar.org> |

---

## Step-by-Step Restoration

### Phase 1 — Detect & Assess (target: 30 min)

1. Confirm the scope: run through the triage table above.
2. Open a war-room channel; post regular status updates every 15 minutes.
3. Check the AWS Health Dashboard and Stellar network status.
4. Identify the last known-good state:
   ```bash
   aws s3 ls s3://$BACKUP_S3_BUCKET/db-backups/ --recursive | sort | tail -5
   ```
   Note the timestamp of the most recent backup. The gap between now and that timestamp is your actual RPO.

### Phase 2 — Infrastructure Recovery (target: 1.5 hours)

#### 2a. Restore database

Use the restore drill script to restore to a new RDS instance:

```bash
export BACKUP_S3_BUCKET=<bucket-name>
export TEMP_RESTORE_DB_URL=postgresql://<user>:<pass>@<new-rds-host>:5432/<db>

bash infra/backup/restore-drill.sh
```

After confirming integrity, promote the restored instance:

```bash
# Update the DATABASE_URL secret in AWS Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id paystream/prod/DATABASE_URL \
  --secret-string "postgresql://<user>:<pass>@<new-rds-host>:5432/paystream"
```

#### 2b. Flush and restart Redis

Redis holds ephemeral cache only — no durable state. Restart the ElastiCache cluster or let the ECS tasks reconnect to an empty cache.

```bash
aws elasticache reboot-replication-group \
  --replication-group-id paystream-prod-redis \
  --apply-immediately
```

#### 2c. Redeploy API layer

Force a new ECS deployment to pick up the updated secret:

```bash
aws ecs update-service \
  --cluster paystream-prod \
  --service paystream-api \
  --force-new-deployment
```

Monitor the deployment:

```bash
aws ecs wait services-stable \
  --cluster paystream-prod \
  --services paystream-api
```

### Phase 3 — Verification (target: 30 min)

Run each check before declaring recovery complete.

```bash
# 1. API health endpoint
curl -sf https://api.paystream.io/health | jq .

# 2. Database connectivity (run from a bastion or ECS exec)
psql "$DATABASE_URL" -c "SELECT count(*) FROM streams;"

# 3. Recent ledger cursor is advancing
psql "$DATABASE_URL" -c "SELECT last_ledger, updated_at FROM indexer_cursor;"

# 4. End-to-end smoke test: create and cancel a stream via the API
curl -sf -X POST https://api.paystream.io/v1/streams \
  -H "Authorization: Bearer $SMOKE_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

All checks must pass before closing the incident.

### Phase 4 — Post-Incident (within 24 hours)

- [ ] Write a blameless post-mortem (template in `docs/runbooks/postmortem-template.md`)
- [ ] Identify the root cause and timeline
- [ ] File follow-up issues for any gaps found
- [ ] Update this runbook if any step was wrong or missing
- [ ] Notify affected users if data loss (RPO breach) occurred

---

## Backup Unavailable

If no backup exists in S3:

1. Check if RDS automated snapshots are available:
   ```bash
   aws rds describe-db-snapshots \
     --db-instance-identifier paystream-prod-db \
     --snapshot-type automated \
     --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]' \
     --output table
   ```
2. Restore from the most recent RDS snapshot via the AWS Console or CLI.
3. Accept the larger-than-target RPO, document it, and file an issue to fix the backup pipeline.

---

## Annual DR Drill

A full DR drill must be conducted **once per year**, in a staging environment.

**Schedule:** Q1 of each calendar year (January–March), coordinated with the engineering lead.

**Drill procedure:**
1. Pick a recent S3 backup.
2. Follow this runbook from Phase 2 onward against staging infrastructure.
3. Measure actual RTO and RPO achieved and compare to targets.
4. Document results in `docs/runbooks/dr-drill-results/YYYY.md`.
5. File issues for any steps that exceeded target times.

**Last drill:** _(update after each drill)_  
**Next scheduled drill:** Q1 next calendar year
