const { pool } = require('./dbService');
const { connection: redis } = require('./queueService');

const CACHE_TTL = 60; // 60 seconds

/**
 * Get cached data or compute and cache it
 */
async function getOrCompute(cacheKey, computeFn) {
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const data = await computeFn();
  await redis.set(cacheKey, JSON.stringify(data), 'EX', CACHE_TTL);
  return data;
}

/**
 * Compute platform-wide summary stats
 */
async function computeSummary(startDate, endDate) {
  let whereClause = "WHERE event_type = 'created'";
  const params = [];

  if (startDate) {
    params.push(new Date(startDate));
    whereClause += ` AND indexed_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(new Date(endDate));
    whereClause += ` AND indexed_at <= $${params.length}`;
  }

  const { rows: createdRows } = await pool.query(
    `SELECT COUNT(*) as total_streams FROM stream_events ${whereClause}`,
    params
  );

  let withdrawWhere = "WHERE event_type = 'withdraw'";
  const withdrawParams = [];
  if (startDate) {
    withdrawParams.push(new Date(startDate));
    withdrawWhere += ` AND indexed_at >= $${withdrawParams.length}`;
  }
  if (endDate) {
    withdrawParams.push(new Date(endDate));
    withdrawWhere += ` AND indexed_at <= $${withdrawParams.length}`;
  }

  const { rows: withdrawRows } = await pool.query(
    `SELECT SUM(CAST(raw_data->>1 AS NUMERIC)) as total_withdrawn FROM stream_events ${withdrawWhere}`,
    withdrawParams
  );

  // Top tokens from 'created' events (token is often first arg in data for some contracts, 
  // but let's look at buildNotification logic in notification service)
  // Switch to created: const [employer, employee, rate] = data; 
  // Wait, token is not in the data of 'created' event based on buildNotification?
  // Let's re-read notification/src/index.js buildNotification.
  
  return {
    totalStreams: parseInt(createdRows[0].total_streams, 10),
    totalWithdrawn: withdrawRows[0].total_withdrawn || "0",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compute stats for a specific employer
 */
async function computeEmployerStats(address, startDate, endDate) {
  // Employer address is in raw_data[0] for 'created' events
  let whereClause = "WHERE event_type = 'created' AND raw_data->>0 = $1";
  const params = [address];

  if (startDate) {
    params.push(new Date(startDate));
    whereClause += ` AND indexed_at >= $${params.length}`;
  }
  if (endDate) {
    params.push(new Date(endDate));
    whereClause += ` AND indexed_at <= $${params.length}`;
  }

  const { rows: createdRows } = await pool.query(
    `SELECT COUNT(*) as total_streams FROM stream_events ${whereClause}`,
    params
  );

  return {
    employer: address,
    totalStreamsCreated: parseInt(createdRows[0].total_streams, 10),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getSummary: (startDate, endDate) => {
    const key = `analytics:summary:${startDate || 'all'}:${endDate || 'all'}`;
    return getOrCompute(key, () => computeSummary(startDate, endDate));
  },
  getEmployerStats: (address, startDate, endDate) => {
    const key = `analytics:employer:${address}:${startDate || 'all'}:${endDate || 'all'}`;
    return getOrCompute(key, () => computeEmployerStats(address, startDate, endDate));
  },
};
