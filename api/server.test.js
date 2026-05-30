const request = require('supertest');
const readinessService = require('./services/readinessService');
const app = require('./server');

jest.mock('./services/stellarService', () => ({}));
jest.mock('./services/readinessService', () => ({
  checkReadiness: jest.fn(),
}));

describe('probe endpoints', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns process health without dependency checks', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.uptime).toEqual(expect.any(Number));
    expect(response.body.started_at).toEqual(expect.any(String));
  });

  it('returns the provided X-Correlation-ID header in responses', async () => {
    const response = await request(app)
      .get('/health')
      .set('X-Correlation-ID', 'test-correlation-id');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toBe('test-correlation-id');
  });

  it('generates an X-Correlation-ID header when none is provided', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-correlation-id']).toEqual(expect.any(String));
    expect(response.headers['x-correlation-id'].length).toBeGreaterThan(0);
  });

  it('returns 200 when readiness dependencies are healthy', async () => {
    readinessService.checkReadiness.mockResolvedValue({
      ready: true,
      status: 'ready',
      checks: [
        {
          name: 'sorobanRpc',
          status: 'ok',
        },
      ],
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
  });

  it('returns 503 when a readiness dependency is unhealthy', async () => {
    readinessService.checkReadiness.mockResolvedValue({
      ready: false,
      status: 'not_ready',
      checks: [
        {
          name: 'sorobanRpc',
          status: 'error',
          error: {
            message: 'RPC health check failed',
          },
        },
      ],
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.checks[0].name).toBe('sorobanRpc');
  });
});

describe('API versioning (#253)', () => {
  it('includes X-API-Version header on all responses', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-api-version']).toBe('v1');
  });

  it('includes deprecation headers on legacy unversioned routes', async () => {
    const response = await request(app)
      .get('/api/streams/count')
      .set('X-API-Key', 'test-key');

    expect(response.headers['x-api-version']).toBe('v1');
    expect(response.headers['x-api-deprecated']).toBe('true');
    expect(response.headers['x-api-deprecation-notice']).toContain('Migrate to /v1/');
  });

  it('does not include deprecation headers on v1 routes', async () => {
    const response = await request(app)
      .get('/v1/api/streams/count')
      .set('X-API-Key', 'test-key');

    expect(response.headers['x-api-version']).toBe('v1');
    expect(response.headers['x-api-deprecated']).toBeUndefined();
    expect(response.headers['x-api-deprecation-notice']).toBeUndefined();
  });
});
