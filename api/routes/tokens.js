const express = require('express');
const { body, param, validationResult } = require('express-validator');
const stellarService = require('../services/stellarService');
const router = express.Router();

/**
 * @swagger
 * /api/tokens/total-supply:
 *   get:
 *     summary: Get total token supply
 *     description: Return the total token supply
 *     tags: [Tokens]
 *     responses:
 *       200:
 *         description: Total supply retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 total_supply:
 *                   $ref: '#/components/schemas/Amount'
 *                   example: "1000000000000"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/total-supply', async (req, res, next) => {
  try {
    const result = await stellarService.callContractMethod({
      contractId: stellarService.tokenContractId,
      functionName: 'total_supply',
      args: []
    });

    res.json({
      success: true,
      total_supply: result.toString(),
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/tokens/balance/{address}:
 *   get:
 *     summary: Get token balance of an address
 *     description: Return the token balance of an address
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/Address'
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 balance:
 *                   $ref: '#/components/schemas/Amount'
 *                   example: "5000000"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/balance/:address', [
  param('address').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid address'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { address } = req.params;

    if (!stellarService.validateAddress(address)) {
      return res.status(400).json({
        error: 'Invalid address',
      });
    }

    const result = await stellarService.callContractMethod({
      contractId: stellarService.tokenContractId,
      functionName: 'balance',
      args: [new stellarService.rpc.Address(address)]
    });

    res.json({
      success: true,
      balance: result.toString(),
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/tokens/transfer:
 *   post:
 *     summary: Transfer tokens between addresses
 *     description: Transfer tokens from one address to another
 *     tags: [Tokens]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - from
 *               - to
 *               - amount
 *             properties:
 *               from:
 *                 $ref: '#/components/schemas/Address'
 *               to:
 *                 $ref: '#/components/schemas/Address'
 *               amount:
 *                 $ref: '#/components/schemas/Amount'
 *     responses:
 *       200:
 *         description: Transfer successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transaction_hash:
 *                   type: string
 *                   example: "g7h8i9j0..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/transfer', [
  body('from').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid from address'),
  body('to').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid to address'),
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

    const { from, to, amount } = req.body;

    if (!stellarService.validateAddress(from) || !stellarService.validateAddress(to)) {
      return res.status(400).json({
        error: 'Invalid addresses',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: from,
      contractId: stellarService.tokenContractId,
      functionName: 'transfer',
      args: [
        new stellarService.rpc.Address(from),
        new stellarService.rpc.Address(to),
        BigInt(amount)
      ]
    });

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
 * /api/tokens/mint:
 *   post:
 *     summary: Mint new tokens to an address
 *     description: Admin mints new tokens to an address, increasing total supply
 *     tags: [Tokens]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin
 *               - to
 *               - amount
 *             properties:
 *               admin:
 *                 $ref: '#/components/schemas/Address'
 *               to:
 *                 $ref: '#/components/schemas/Address'
 *               amount:
 *                 $ref: '#/components/schemas/Amount'
 *     responses:
 *       200:
 *         description: Mint successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 transaction_hash:
 *                   type: string
 *                   example: "h8i9j0k1..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/mint', [
  body('admin').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid admin address'),
  body('to').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid recipient address'),
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

    const { admin, to, amount } = req.body;

    if (!stellarService.validateAddress(admin) || !stellarService.validateAddress(to)) {
      return res.status(400).json({
        error: 'Invalid addresses',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: admin,
      contractId: stellarService.tokenContractId,
      functionName: 'mint',
      args: [
        new stellarService.rpc.Address(admin),
        new stellarService.rpc.Address(to),
        BigInt(amount)
      ]
    });

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
 * /api/tokens/{address}:
 *   get:
 *     summary: Get SEP-41 token metadata
 *     description: Returns name, symbol, and decimals for any SEP-41 token. Cached for 1 hour.
 *     tags: [Tokens]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Token contract address (C...)
 *     responses:
 *       200:
 *         description: Token metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 address:
 *                   type: string
 *                 name:
 *                   type: string
 *                 symbol:
 *                   type: string
 *                 decimals:
 *                   type: integer
 *       404:
 *         description: Token not found or invalid address
 */
router.get('/:address', [
  param('address').isString().matches(/^C[A-Z0-9]{62}$/).withMessage('Invalid contract address'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(404).json({ error: 'Invalid token address' });
    }

    const { address } = req.params;

    if (!stellarService.validateContractId(address)) {
      return res.status(404).json({ error: 'Invalid token address' });
    }

    const metadata = await stellarService.getTokenMetadata(address);

    res.json({
      success: true,
      address,
      ...metadata,
    });

  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      return res.status(404).json({ error: 'Token not found' });
    }
    next(error);
  }
});

module.exports = router;
