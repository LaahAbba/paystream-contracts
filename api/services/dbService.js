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

// In-memory fallback stores for preferences and notifications
const inMemoryPrefs = new Map();
const inMemoryNotifications = new Map();

/**
 * Delete all off-chain user data for a given Stellar address.
 */
async function deleteOffChainUserData(address) {
  // 1. Delete from in-memory fallback stores
  const deletedPrefs = inMemoryPrefs.delete(address);
  const deletedNotifs = inMemoryNotifications.delete(address);
  
  let dbDeleted = false;

  // 2. Delete from database if configured
  if (pool) {
    try {
      // We run inside a transaction to ensure atomic execution
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Attempt deletions on potential off-chain tables
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
  inMemoryPrefs,
  inMemoryNotifications,
  deleteOffChainUserData,
};
