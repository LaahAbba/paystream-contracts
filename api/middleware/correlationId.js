const { randomUUID } = require('crypto');

function correlationIdMiddleware(req, res, next) {
  const incomingId = req.header('X-Correlation-ID');
  const correlationId = incomingId && incomingId.trim() ? incomingId.trim() : randomUUID();

  req.correlationId = correlationId;
  res.set('X-Correlation-ID', correlationId);
  next();
}

module.exports = correlationIdMiddleware;
