const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const correlationId = require('./middleware/correlationId');
const { loadSecrets } = require('./services/secretsService');
const { closePool } = require('./services/dbService');
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const { versionHeader, deprecationWarning } = require('./middleware/versioning');
const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/streams');
const tokenRoutes = require('./routes/tokens');
const adminRoutes = require('./routes/admin');
const governanceRoutes = require('./routes/governance');
const userRoutes = require('./routes/users');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;
const startedAt = new Date();

morgan.token('correlation-id', (req) => req.correlationId || '-');
app.use(correlationId);

const logFormat = ':remote-addr :method :url :status :res[content-length] - :response-time ms :correlation-id';
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(logFormat));
}

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Version header on all responses
app.use(versionHeader);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PayStream REST API',
      version: '1.0.0',
      description: 'REST API wrapper for PayStream smart contracts on Stellar',
      contact: {
        name: 'PayStream Team',
        email: 'support@paystream.example',
      },
      license: {
        name: 'Apache 2.0',
        url: 'https://www.apache.org/licenses/LICENSE-2.0.html',
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT obtained from POST /auth/verify (#245)',
        },
      },
      schemas: {
        Address: {
          type: 'string',
          description: 'Stellar address (G...)',
          pattern: '^G[A-Z0-9]{55}$',
        },
        StreamId: {
          type: 'integer',
          description: 'Stream identifier',
          minimum: 1,
        },
        Amount: {
          type: 'string',
          description: 'Token amount in smallest units (i128)',
          pattern: '^[0-9]+$',
        },
        Rate: {
          type: 'string',
          description: 'Tokens per second (i128)',
          pattern: '^[0-9]+$',
        },
        Timestamp: {
          type: 'integer',
          description: 'Unix timestamp in seconds',
          minimum: 0,
        },
        StreamStatus: {
          type: 'string',
          enum: ['Active', 'Paused', 'Cancelled', 'Exhausted'],
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            code: {
              type: 'string',
              description: 'Error code',
            },
            details: {
              type: 'object',
              description: 'Additional error details',
            },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              example: 'Validation failed',
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  msg: { type: 'string' },
                  param: { type: 'string' },
                  location: { type: 'string' },
                },
              },
            },
          },
        },
      },
      responses: {
        ValidationError: {
          description: 'Input validation failed',
          content: {
            application/json: {
              schema: { $ref: '#/components/schemas/ValidationError' },
            },
          },
        },
        UnauthorizedError: {
          description: 'Authentication required or invalid credentials',
          content: {
            application/json: {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./api/routes/*.js'], // Path to the API docs
};

const specs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs));

// Export OpenAPI spec as JSON
app.get('/docs/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

// Export OpenAPI spec as YAML
const YAML = require('yaml');
app.get('/docs/openapi.yaml', (req, res) => {
  res.setHeader('Content-Type', 'text/yaml');
  res.send(YAML.stringify(specs));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    started_at: startedAt.toISOString(),
    version: '1.0.0',
  });
});

// Readiness probe endpoint
const readinessService = require('./services/readinessService');
app.get('/ready', async (req, res) => {
  try {
    const readiness = await readinessService.checkReadiness();
    const statusCode = readiness.ready ? 200 : 503;
    res.status(statusCode).json(readiness);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Auth routes (public — no authMiddleware)
app.use('/auth', authRoutes);

// v1 API routes (current)
app.use('/v1/api/streams', authMiddleware, streamRoutes);
app.use('/v1/api/tokens', authMiddleware, tokenRoutes);
app.use('/v1/api/admin', authMiddleware, adminRoutes);
app.use('/v1/api/governance', authMiddleware, governanceRoutes);
app.use('/v1/users', authMiddleware, userRoutes);

// Legacy unversioned routes (deprecated)
app.use('/api/streams', deprecationWarning, authMiddleware, streamRoutes);
app.use('/api/tokens', deprecationWarning, authMiddleware, tokenRoutes);
app.use('/api/admin', deprecationWarning, authMiddleware, adminRoutes);
app.use('/api/governance', deprecationWarning, authMiddleware, governanceRoutes);
app.use('/users', deprecationWarning, authMiddleware, userRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Error handling middleware
app.use(errorHandler);

let server;
let isShuttingDown = false;

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!server) {
      return resolve();
    }
    server.close((err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`[Shutdown] ${signal} received, stopping new connections and waiting up to 30s for in-flight requests`);

  const forceExit = setTimeout(() => {
    console.error('[Shutdown] Force exiting after 30 seconds');
    process.exit(1);
  }, 30000);

  try {
    await stopServer();
    await closePool();
    console.log('[Shutdown] Database connection closed');
  } catch (err) {
    console.error('[Shutdown] Error during graceful shutdown', err);
  } finally {
    clearTimeout(forceExit);
    console.log('[Shutdown] Complete');
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start() {
  try {
    await loadSecrets();

    server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`PayStream REST API server running on port ${PORT}`);
      console.log(`API documentation available at http://localhost:${PORT}/api-docs`);
      console.log(`Health check available at http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('[Startup] Failed to initialize API server', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
