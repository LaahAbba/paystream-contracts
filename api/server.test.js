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
