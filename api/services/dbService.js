const { Pool } = require('pg');

let pool = null;
const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl) {
  const poolSize = parseInt(process.env.DB_POOL_MAX || '10', 10);
  const idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
  pool = new Pool({
    connectionString: databaseUrl,
    max: poolSize,
    idleTimeoutMillis,
  });
}

// In-memory fallback stores
const inMemoryPrefs = new Map();
const inMemoryNotifications = new Map();
const inMemoryAuditLogs = [];
let auditLogIdCounter = 1;

async function initializeAuditLogTable() {
  if (!pool) return;
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          actor VARCHAR(56) NOT NULL,
          action VARCHAR(100) NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          params JSONB,
          transaction_hash VARCHAR(100)
        )
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn(`[DbService] Failed to initialize audit_logs table: ${err.message}`);
  }
}

initializeAuditLogTable();

async function logAdminAction(actor, action, params, transactionHash) {
  const timestamp = new Date();
  
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query(
          'INSERT INTO audit_logs (actor, action, timestamp, params, transaction_hash) VALUES ($1, $2, $3, $4, $5)',
          [actor, action, timestamp, params, transactionHash]
        );
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn(`[DbService] Failed to write audit log to database: ${err.message}`);
      // Fallback to in-memory
      inMemoryAuditLogs.push({
        id: auditLogIdCounter++,
        actor,
        action,
        timestamp,
        params,
        transaction_hash: transactionHash
      });
    }
  } else {
    inMemoryAuditLogs.push({
      id: auditLogIdCounter++,
      actor,
      action,
      timestamp,
      params,
      transaction_hash: transactionHash
    });
  }
}

async function getAuditLogs(limit = 100, offset = 0) {
  if (pool) {
    try {
      const client = await pool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1 OFFSET $2',
          [limit, offset]
        );
        return result.rows;
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn(`[DbService] Failed to read audit logs from database: ${err.message}`);
      // Fallback to in-memory
      return [...inMemoryAuditLogs].reverse().slice(offset, offset + limit);
    }
  } else {
    return [...inMemoryAuditLogs].reverse().slice(offset, offset + limit);
  }
}

async function exportAuditLogsCSV() {
  const logs = await getAuditLogs(100000, 0);
  const headers = ['id', 'actor', 'action', 'timestamp', 'params', 'transaction_hash'];
  const csvLines = [headers.join(',')];
  
  logs.forEach(log => {
    const values = [
      log.id,
      log.actor,
      log.action,
      log.timestamp.toISOString(),
      JSON.stringify(log.params).replace(/"/g, '""'),
      log.transaction_hash || ''
    ];
    csvLines.push(values.map(v => `"${v}"`).join(','));
  });
  
  return csvLines.join('\n');
}

async function closePool() {
  if (pool) {
    await pool.end();
  }
}

/**
 * Delete all off-chain user data for a given Stellar address.
 */
async function deleteOffChainUserData(address) {
  const deletedPrefs = inMemoryPrefs.delete(address);
  const deletedNotifs = inMemoryNotifications.delete(address);
  
  let dbDeleted = false;

  if (pool) {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM user_preferences WHERE address = $1', [address]);
        await client.query('DELETE FROM user_notifications WHERE address = $1', [address]);
        await client.query('DELETE FROM notifications WHERE user_address = $1', [address]);
        await client.query('COMMIT');
        dbDeleted = true;
      } catch (err) {
        await client.query('ROLLBACK');
        console.warn(`[DbService] SQL deletion failed (tables might not exist): ${err.message}`);
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn(`[DbService] Database connection failed for deletion: ${err.message}`);
    }
  }

  return {
    success: true,
    deletedFromMemory: deletedPrefs || deletedNotifs,
    deletedFromDb: dbDeleted,
  };
}

module.exports = {
  pool,
  closePool,
  inMemoryPrefs,
  inMemoryNotifications,
  deleteOffChainUserData,
  logAdminAction,
  getAuditLogs,
  exportAuditLogsCSV,
};
