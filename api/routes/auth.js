// SPDX-License-Identifier: Apache-2.0
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: JWT authentication via Stellar keypair signature (#245)
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Keypair } = require('stellar-sdk');
const { body, validationResult } = require('express-validator');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// In-memory nonce store: address -> { nonce, expiresAt }
// In production replace with Redis or a DB-backed store.
const nonceStore = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const JWT_EXPIRY = '24h';

// Purge expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of nonceStore.entries()) {
    if (val.expiresAt < now) nonceStore.delete(key);
  }
}, 60_000);

/**
 * @swagger
 * /auth/challenge:
 *   post:
 *     summary: Request a sign-in challenge nonce
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address]
 *             properties:
 *               address:
 *                 $ref: '#/components/schemas/Address'
 *     responses:
 *       200:
 *         description: Nonce to sign
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nonce:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post(
  '/challenge',
  [body('address').matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid Stellar address')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { address } = req.body;
    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    nonceStore.set(address, { nonce, expiresAt: expiresAt.getTime() });

    res.json({ nonce, expiresAt: expiresAt.toISOString() });
  }
);

/**
 * @swagger
 * /auth/verify:
 *   post:
 *     summary: Verify signed nonce and receive a JWT
 *     description: |
 *       The client must sign the nonce returned by /auth/challenge using their
 *       Stellar secret key (Ed25519). The signature is the hex-encoded raw
 *       Ed25519 signature over the UTF-8 bytes of the nonce string.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [address, signature]
 *             properties:
 *               address:
 *                 $ref: '#/components/schemas/Address'
 *               signature:
 *                 type: string
 *                 description: Hex-encoded Ed25519 signature of the nonce
 *     responses:
 *       200:
 *         description: JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 expiresIn:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid signature or expired nonce
 */
router.post(
  '/verify',
  [
    body('address').matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid Stellar address'),
    body('signature').isHexadecimal().withMessage('Signature must be hex-encoded'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const { address, signature } = req.body;
    const entry = nonceStore.get(address);

    if (!entry || Date.now() > entry.expiresAt) {
      nonceStore.delete(address);
      return res.status(401).json({ error: 'Nonce expired or not found. Request a new challenge.', code: 'NONCE_EXPIRED' });
    }

    // Verify Ed25519 signature: the client signs the raw nonce bytes
    try {
      const keypair = Keypair.fromPublicKey(address);
      const nonceBytes = Buffer.from(entry.nonce, 'utf8');
      const sigBytes = Buffer.from(signature, 'hex');
      const valid = keypair.verify(nonceBytes, sigBytes);
      if (!valid) {
        return res.status(401).json({ error: 'Signature verification failed', code: 'INVALID_SIGNATURE' });
      }
    } catch {
      return res.status(401).json({ error: 'Signature verification failed', code: 'INVALID_SIGNATURE' });
    }

    // Consume nonce (one-time use)
    nonceStore.delete(address);

    const token = jwt.sign({ sub: address }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
    res.json({ token, expiresIn: JWT_EXPIRY });
  }
);

module.exports = router;
