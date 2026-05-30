const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function verify() {
  const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log(`Connecting to Redis at ${REDIS_URL}...`);

  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    connectTimeout: 2000,
  });

  try {
    await connection.ping();
    console.log('✅ Redis connection successful');

    const testQueue = new Queue('test-queue', { connection });
    await testQueue.add('test-job', { foo: 'bar' });
    console.log('✅ Successfully added job to test-queue');

    const count = await testQueue.count();
    console.log(`✅ Queue job count: ${count}`);

    await testQueue.close();
    await connection.quit();
    console.log('✅ Verification complete');
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
      console.log(' (Note: This is expected if Redis is not running locally)');
    }
    process.exit(1);
  }
}

verify();
