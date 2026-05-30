const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('./server');
const dbService = require('./services/dbService');
const emailService = require('./services/emailService');
const { JWT_SECRET } = require('./middleware/auth');

// Mock stellarService to avoid real blockchain calls
jest.mock('./services/stellarService', () => ({
  validateAddress: jest.fn((address) => {
    // Basic format validation mock
    return typeof address === 'string' && address.startsWith('G') && address.length === 56;
  }),
}));

describe('DELETE /users/:address', () => {
  const userAddress = 'GB3G23YPXKJDCS23S6G2VCSFLHQK24G6V2WCSFLHQK24G6V2WCSFLHQK';
  const otherAddress = 'GC4G23YPXKJDCS23S6G2VCSFLHQK24G6V2WCSFLHQK24G6V2WCSFLHQK';
  let token;
  let otherToken;

  beforeEach(() => {
    // Generate valid JWT tokens for tests
    token = jwt.sign({ sub: userAddress }, JWT_SECRET);
    otherToken = jwt.sign({ sub: otherAddress }, JWT_SECRET);
    
    // Clear in-memory DB and sent emails before each test
    dbService.inMemoryPrefs.clear();
    dbService.inMemoryNotifications.clear();
    emailService.sentEmails.length = 0;
  });

  it('fails with 401 when no authentication is provided', async () => {
    const response = await request(app)
      .delete(`/users/${userAddress}`)
      .send({ email: 'user@example.com' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('MISSING_AUTH');
  });

  it('fails with 403 when trying to delete another user\'s data', async () => {
    const response = await request(app)
      .delete(`/users/${userAddress}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ email: 'other@example.com' });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN_USER');
  });

  it('fails with 400 when no email is provided and none is stored', async () => {
    const response = await request(app)
      .delete(`/users/${userAddress}`)
      .set('Authorization', `Bearer ${token}`)
      .send({}); // no email

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('EMAIL_REQUIRED');
  });

  it('successfully deletes user data when email is provided in the body', async () => {
    // Pre-populate some off-chain data
    dbService.inMemoryPrefs.set(userAddress, { theme: 'dark' });
    dbService.inMemoryNotifications.set(userAddress, [{ id: 1, message: 'Welcome' }]);

    const response = await request(app)
      .delete(`/users/${userAddress}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'test@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('successfully deleted');
    expect(response.body.onChainWarning).toContain('permanently recorded on the Stellar blockchain');
    expect(response.body.emailSent).toBe(true);
    expect(response.body.recipient).toBe('test@example.com');

    // Verify data is deleted
    expect(dbService.inMemoryPrefs.has(userAddress)).toBe(false);
    expect(dbService.inMemoryNotifications.has(userAddress)).toBe(false);

    // Verify email was "sent"
    expect(emailService.sentEmails.length).toBe(1);
    expect(emailService.sentEmails[0].to).toBe('test@example.com');
    expect(emailService.sentEmails[0].subject).toContain('Off-chain Data Deletion Request');
  });

  it('successfully deletes user data using stored email preferences', async () => {
    // Pre-populate some off-chain data including the email
    dbService.inMemoryPrefs.set(userAddress, { theme: 'light', email: 'stored@example.com' });

    const response = await request(app)
      .delete(`/users/${userAddress}`)
      .set('Authorization', `Bearer ${token}`)
      .send({}); // no email in body, should use stored one

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.emailSent).toBe(true);
    expect(response.body.recipient).toBe('stored@example.com');

    // Verify data is deleted
    expect(dbService.inMemoryPrefs.has(userAddress)).toBe(false);

    // Verify email was sent to stored address
    expect(emailService.sentEmails.length).toBe(1);
    expect(emailService.sentEmails[0].to).toBe('stored@example.com');
  });

  it('allows deletion via legacy X-API-Key with custom email', async () => {
    // Pre-populate some off-chain data
    dbService.inMemoryPrefs.set(userAddress, { theme: 'dark' });
    
    // Set mock API key
    process.env.API_KEYS = 'test-api-key-123';

    const response = await request(app)
      .delete(`/users/${userAddress}`)
      .set('X-API-Key', 'test-api-key-123')
      .send({ email: 'admin-action@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.recipient).toBe('admin-action@example.com');
    expect(dbService.inMemoryPrefs.has(userAddress)).toBe(false);
  });
});
