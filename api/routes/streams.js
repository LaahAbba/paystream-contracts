const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const stellarService = require('../services/stellarService');
const cache = require('../services/cacheService');
const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     StreamParams:
 *       type: object
 *       required:
 *         - employee
 *         - token_address
 *         - deposit
 *         - rate_per_second
 *         - stop_time
 *         - cooldown_period
 *         - cliff_time
 *       properties:
 *         employee:
 *           $ref: '#/components/schemas/Address'
 *         token_address:
 *           $ref: '#/components/schemas/Address'
 *         deposit:
 *           $ref: '#/components/schemas/Amount'
 *         rate_per_second:
 *           $ref: '#/components/schemas/Rate'
 *         stop_time:
 *           $ref: '#/components/schemas/Timestamp'
 *         cooldown_period:
 *           $ref: '#/components/schemas/Timestamp'
 *         cliff_time:
 *           $ref: '#/components/schemas/Timestamp'
 */

/**
 * @swagger
 * /api/streams/create:
 *   post:
 *     summary: Create a new salary stream
 *     description: Employer creates a salary stream and deposits funds into the contract escrow
 *     tags: [Streams]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employer
 *               - employee
 *               - token_address
 *               - deposit
 *               - rate_per_second
 *               - stop_time
 *               - cooldown_period
 *               - cliff_time
 *             properties:
 *               employer:
 *                 $ref: '#/components/schemas/Address'
 *               employee:
 *                 $ref: '#/components/schemas/Address'
 *               token_address:
 *                 $ref: '#/components/schemas/Address'
 *               deposit:
 *                 $ref: '#/components/schemas/Amount'
 *               rate_per_second:
 *                 $ref: '#/components/schemas/Rate'
 *               stop_time:
 *                 $ref: '#/components/schemas/Timestamp'
 *               cooldown_period:
 *                 $ref: '#/components/schemas/Timestamp'
 *               cliff_time:
 *                 $ref: '#/components/schemas/Timestamp'
 *     responses:
 *       200:
 *         description: Stream created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stream_id:
 *                   type: integer
 *                   example: 101
 *                 transaction_hash:
 *                   type: string
 *                   example: "a1b2c3d4..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       422:
 *         description: Idempotency error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/create', idempotencyMiddleware, [
  body('employer').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid employer address'),
  body('employee').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid employee address'),
  body('token_address').isString().matches(/^C[A-Z0-9]{62}$/).withMessage('Invalid token contract address'),
  body('deposit').isString().matches(/^[0-9]+$/).withMessage('Invalid deposit amount'),
  body('rate_per_second').isString().matches(/^[0-9]+$/).withMessage('Invalid rate per second'),
  body('stop_time').isInt({ min: 0 }).withMessage('Invalid stop time'),
  body('cooldown_period').isInt({ min: 0 }).withMessage('Invalid cooldown period'),
  body('cliff_time').isInt({ min: 0 }).withMessage('Invalid cliff time'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const {
      employer,
      employee,
      token_address,
      deposit,
      rate_per_second,
      stop_time,
      cooldown_period,
      cliff_time
    } = req.body;

    // Validate addresses
    if (!stellarService.validateAddress(employer) || !stellarService.validateAddress(employee)) {
      return res.status(400).json({
        error: 'Invalid Stellar addresses',
      });
    }

    if (!stellarService.validateContractId(token_address)) {
      return res.status(400).json({
        error: 'Invalid token contract address',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: employer,
      contractId: stellarService.streamContractId,
      functionName: 'create_stream',
      args: [
        new stellarService.rpc.Address(employer),
        new stellarService.rpc.Address(employee),
        new stellarService.rpc.Address(token_address),
        BigInt(deposit),
        BigInt(rate_per_second),
        stop_time,
        cooldown_period,
        cliff_time
      ]
    });

    res.json({
      success: true,
      stream_id: result.result,
      transaction_hash: result.hash,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/streams/{stream_id}:
 *   get:
 *     summary: Get stream information
 *     description: Read the full state of a stream by ID
 *     tags: [Streams]
 *     parameters:
 *       - in: path
 *         name: stream_id
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/StreamId'
 *     responses:
 *       200:
 *         description: Stream information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 stream:
 *                   type: object
 *                   properties:
 *                     id: { type: 'integer', example: 101 }
 *                     employer: { $ref: '#/components/schemas/Address' }
 *                     employee: { $ref: '#/components/schemas/Address' }
 *                     token: { $ref: '#/components/schemas/Address' }
 *                     deposit: { $ref: '#/components/schemas/Amount' }
 *                     withdrawn: { $ref: '#/components/schemas/Amount' }
 *                     rate_per_second: { $ref: '#/components/schemas/Rate' }
 *                     status: { $ref: '#/components/schemas/StreamStatus' }
 *       404:
 *         description: Stream not found
 */
router.get('/:stream_id', [
  param('stream_id').isInt({ min: 1 }).withMessage('Invalid stream ID'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { stream_id } = req.params;

    const cached = await cache.getStream(stream_id);
    if (cached) {
      res.set('Cache-Control', 'public, max-age=10');
      res.set('X-Cache', 'HIT');
      return res.json({ success: true, stream: cached });
    }

    const result = await stellarService.callContractMethod({
      contractId: stellarService.streamContractId,
      functionName: 'get_stream',
      args: [BigInt(stream_id)]
    });

    await cache.setStream(stream_id, result);

    res.set('Cache-Control', 'public, max-age=10');
    res.set('X-Cache', 'MISS');
    res.json({
      success: true,
      stream: result,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/streams/count:
 *   get:
 *     summary: Get total number of streams
 *     description: Total number of streams ever created
 *     tags: [Streams]
 *     responses:
 *       200:
 *         description: Stream count retrieved successfully
 */
router.get('/count', async (req, res, next) => {
  try {
    const result = await stellarService.callContractMethod({
      contractId: stellarService.streamContractId,
      functionName: 'stream_count',
      args: []
    });

    res.json({
      success: true,
      count: result,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/streams/{stream_id}/claimable:
 *   get:
 *     summary: Get claimable amount for a stream
 *     description: Query how many tokens the employee can withdraw right now
 *     tags: [Streams]
 *     parameters:
 *       - in: path
 *         name: stream_id
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/StreamId'
 *     responses:
 *       200:
 *         description: Claimable amount retrieved successfully
 */
router.get('/:stream_id/claimable', [
  param('stream_id').isInt({ min: 1 }).withMessage('Invalid stream ID'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { stream_id } = req.params;

    const result = await stellarService.callContractMethod({
      contractId: stellarService.streamContractId,
      functionName: 'claimable',
      args: [BigInt(stream_id)]
    });

    res.json({
      success: true,
      claimable_amount: result.toString(),
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/streams/{stream_id}/withdraw:
 *   post:
 *     summary: Withdraw claimable tokens from a stream
 *     description: Employee withdraws all claimable tokens earned so far
 *     tags: [Streams]
 *     parameters:
 *       - in: path
 *         name: stream_id
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/StreamId'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employee
 *             properties:
 *               employee:
 *                 $ref: '#/components/schemas/Address'
 *     responses:
 *       200:
 *         description: Withdrawal successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 amount_withdrawn:
 *                   $ref: '#/components/schemas/Amount'
 *                   example: "5000000"
 *                 transaction_hash:
 *                   type: string
 *                   example: "b2c3d4e5..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/:stream_id/withdraw', [
  param('stream_id').isInt({ min: 1 }).withMessage('Invalid stream ID'),
  body('employee').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid employee address'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { stream_id } = req.params;
    const { employee } = req.body;

    if (!stellarService.validateAddress(employee)) {
      return res.status(400).json({
        error: 'Invalid employee address',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: employee,
      contractId: stellarService.streamContractId,
      functionName: 'withdraw',
      args: [
        new stellarService.rpc.Address(employee),
        BigInt(stream_id)
      ]
    });

    await cache.invalidateStream(stream_id);

    res.json({
      success: true,
      amount_withdrawn: result.result.toString(),
      transaction_hash: result.hash,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/streams/cache-metrics:
 *   get:
 *     summary: Cache hit/miss metrics
 *     tags: [Streams]
 *     responses:
 *       200:
 *         description: Cache metrics
 */
router.get('/cache-metrics', (req, res) => {
  res.json({ success: true, cache: cache.getMetrics() });
});

module.exports = router;
