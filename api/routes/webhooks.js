// SPDX-License-Identifier: Apache-2.0
const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const dbService = require('../services/dbService');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Register a new webhook (#249)
 *     description: Allow employers/employees to register webhooks that fire on stream state changes.
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 example: https://api.example.com/webhooks/paystream
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [stream_created, withdrawn, paused, cancelled]
 *                 example: ["stream_created", "withdrawn"]
 *     responses:
 *       201:
 *         description: Webhook registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 webhook_id:
 *                   type: string
 *                   format: uuid
 *                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                 secret:
 *                   type: string
 *                   example: "f6a1b2c3..."
 *                 message:
 *                   type: string
 *                   example: "Webhook registered successfully."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post(
  '/',
  authMiddleware,
  [
    body('url').isURL().withMessage('Valid URL is required'),
    body('events')
      .optional()
      .isArray()
      .withMessage('Events must be an array')
      .custom((events) => {
        const validEvents = ['stream_created', 'withdrawn', 'paused', 'cancelled'];
        return events.every((e) => validEvents.includes(e));
      })
      .withMessage('Invalid event type included'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { url, events = ['stream_created', 'withdrawn', 'paused', 'cancelled'] } = req.body;
      const address = req.stellarAddress; // From authMiddleware
      const secret = crypto.randomBytes(32).toString('hex');
      const id = crypto.randomUUID();

      if (dbService.pool) {
        await dbService.pool.query(
          'INSERT INTO webhooks (id, url, address, secret, events) VALUES ($1, $2, $3, $4, $5)',
          [id, url, address, secret, events]
        );
      } else {
        // Fallback for environments without Postgres (matching dbService pattern)
        const userWebhooks = dbService.inMemoryWebhooks.get(address) || [];
        userWebhooks.push({ id, url, secret, events, created_at: new Date() });
        dbService.inMemoryWebhooks.set(address, userWebhooks);
      }

      return res.status(201).json({
        success: true,
        webhook_id: id,
        secret,
        message: 'Webhook registered successfully. Save the secret to verify HMAC signatures.',
      });
    } catch (err) {
      console.error('[Webhooks] Registration failed:', err);
      next(err);
    }
  }
);

module.exports = router;
