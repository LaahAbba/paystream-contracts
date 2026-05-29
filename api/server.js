const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/streams');
const tokenRoutes = require('./routes/tokens');
const adminRoutes = require('./routes/admin');
const governanceRoutes = require('./routes/governance');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;
const startedAt = new Date();

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
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

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

// API routes
app.use('/api/streams', authMiddleware, streamRoutes);
app.use('/api/tokens', authMiddleware, tokenRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/governance', authMiddleware, governanceRoutes);
app.use('/users', authMiddleware, userRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PayStream REST API server running on port ${PORT}`);
    console.log(`API documentation available at http://localhost:${PORT}/api-docs`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
  });
}

module.exports = app;
