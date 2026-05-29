const express = require('express');
const { body, param, validationResult, query } = require('express-validator');
const stellarService = require('../services/stellarService');
const dbService = require('../services/dbService');
const router = express.Router();

/**
 * @swagger
 * /api/admin/initialize:
 *   post:
 *     summary: Initialize stream contract
 *     description: Set contract admin. Must be called once after deployment
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin
 *             properties:
 *               admin:
 *                 $ref: '#/components/schemas/Address'
 *     responses:
 *       200:
 *         description: Contract initialized successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transaction_hash:
 *                   type: string
 */
router.post('/initialize', [
  body('admin').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid admin address'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { admin } = req.body;

    if (!stellarService.validateAddress(admin)) {
      return res.status(400).json({
        error: 'Invalid admin address',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: admin,
      contractId: stellarService.streamContractId,
      functionName: 'initialize',
      args: [new stellarService.rpc.Address(admin)]
    });

    await dbService.logAdminAction(admin, 'initialize', { admin }, result.hash);

    res.json({
      success: true,
      transaction_hash: result.hash,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/pause-contract:
 *   post:
 *     summary: Pause entire contract
 *     description: Admin pauses entire contract. Blocks create_stream, create_streams_batch, and withdraw
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin
 *               - nonce
 *             properties:
 *               admin:
 *                 $ref: '#/components/schemas/Address'
 *               nonce:
 *                 type: integer
 *                 description: Current admin nonce (replay protection)
 *     responses:
 *       200:
 *         description: Contract paused successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transaction_hash:
 *                   type: string
 */
router.post('/pause-contract', [
  body('admin').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid admin address'),
  body('nonce').isInt({ min: 0 }).withMessage('Invalid nonce'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { admin, nonce } = req.body;

    if (!stellarService.validateAddress(admin)) {
      return res.status(400).json({
        error: 'Invalid admin address',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: admin,
      contractId: stellarService.streamContractId,
      functionName: 'pause_contract',
      args: [
        new stellarService.rpc.Address(admin),
        BigInt(nonce)
      ]
    });

    await dbService.logAdminAction(admin, 'pause_contract', { admin, nonce }, result.hash);

    res.json({
      success: true,
      transaction_hash: result.hash,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/set-min-deposit:
 *   post:
 *     summary: Set minimum deposit amount
 *     description: Admin sets minimum deposit enforced on create_stream
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin
 *               - nonce
 *               - amount
 *             properties:
 *               admin:
 *                 $ref: '#/components/schemas/Address'
 *               nonce:
 *                 type: integer
 *                 description: Current admin nonce (replay protection)
 *               amount:
 *                 $ref: '#/components/schemas/Amount'
 *     responses:
 *       200:
 *         description: Minimum deposit set successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 transaction_hash:
 *                   type: string
 */
router.post('/set-min-deposit', [
  body('admin').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid admin address'),
  body('nonce').isInt({ min: 0 }).withMessage('Invalid nonce'),
  body('amount').isString().matches(/^[0-9]+$/).withMessage('Invalid amount'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { admin, nonce, amount } = req.body;

    if (!stellarService.validateAddress(admin)) {
      return res.status(400).json({
        error: 'Invalid admin address',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: admin,
      contractId: stellarService.streamContractId,
      functionName: 'set_min_deposit',
      args: [
        new stellarService.rpc.Address(admin),
        BigInt(nonce),
        BigInt(amount)
      ]
    });

    await dbService.logAdminAction(admin, 'set_min_deposit', { admin, nonce, amount }, result.hash);

    res.json({
      success: true,
      transaction_hash: result.hash,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: Get admin audit logs
 *     description: Retrieve audit logs of admin actions
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Number of logs to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: Audit logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   actor:
 *                     type: string
 *                   action:
 *                     type: string
 *                   timestamp:
 *                     type: string
 *                   params:
 *                     type: object
 *                   transaction_hash:
 *                     type: string
 */
router.get('/audit-logs', [
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('offset').optional().isInt({ min: 0 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const logs = await dbService.getAuditLogs(limit, offset);

    res.json(logs);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/admin/audit-logs/export:
 *   get:
 *     summary: Export audit logs as CSV
 *     description: Download audit logs in CSV format
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: CSV file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/audit-logs/export', async (req, res, next) => {
  try {
    const csv = await dbService.exportAuditLogsCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-logs.csv"');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
