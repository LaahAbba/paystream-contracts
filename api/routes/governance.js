const express = require('express');
const { body, param, validationResult } = require('express-validator');
const stellarService = require('../services/stellarService');
const router = express.Router();

/**
 * @swagger
 * /api/governance/propose:
 *   post:
 *     summary: Propose a parameter change
 *     description: Propose a governance parameter change
 *     tags: [Governance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - proposer
 *               - param
 *               - new_value
 *             properties:
 *               proposer:
 *                 $ref: '#/components/schemas/Address'
 *               param:
 *                 type: string
 *                 enum: [MinDeposit, MaxStreamsPerEmployer, ProtocolFeeBps, ProtocolFeeRecipient]
 *               new_value:
 *                 type: integer
 *                 description: New parameter value
 *     responses:
 *       200:
 *         description: Proposal created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 proposal_id:
 *                   type: integer
 *                   example: 1
 *                 transaction_hash:
 *                   type: string
 *                   example: "g1h2i3j4..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/propose', [
  body('proposer').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid proposer address'),
  body('param').isIn(['MinDeposit', 'MaxStreamsPerEmployer', 'ProtocolFeeBps', 'ProtocolFeeRecipient']).withMessage('Invalid parameter'),
  body('new_value').isInt({ min: 0 }).withMessage('Invalid new value'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { proposer, param, new_value } = req.body;

    if (!stellarService.validateAddress(proposer)) {
      return res.status(400).json({
        error: 'Invalid proposer address',
      });
    }

    // Map parameter names to contract enum values
    const paramMap = {
      'MinDeposit': 0,
      'MaxStreamsPerEmployer': 1,
      'ProtocolFeeBps': 2,
      'ProtocolFeeRecipient': 3
    };

    const paramValue = paramMap[param];

    const result = await stellarService.submitContractTransaction({
      sourceKey: proposer,
      contractId: stellarService.streamContractId,
      functionName: 'propose_parameter',
      args: [
        new stellarService.rpc.Address(proposer),
        paramValue,
        BigInt(new_value)
      ]
    });

    res.json({
      success: true,
      proposal_id: result.result,
      transaction_hash: result.hash,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/governance/vote:
 *   post:
 *     summary: Vote on a proposal
 *     description: Vote on an active governance proposal
 *     tags: [Governance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - voter
 *               - proposal_id
 *               - support
 *             properties:
 *               voter:
 *                 $ref: '#/components/schemas/Address'
 *               proposal_id:
 *                 type: integer
 *                 description: Proposal ID
 *               support:
 *                 type: boolean
 *                 description: True to vote for, false to vote against
 *     responses:
 *       200:
 *         description: Vote cast successfully
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
 *                   example: "h2i3j4k5..."
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/vote', [
  body('voter').isString().matches(/^G[A-Z0-9]{55}$/).withMessage('Invalid voter address'),
  body('proposal_id').isInt({ min: 1 }).withMessage('Invalid proposal ID'),
  body('support').isBoolean().withMessage('Support must be boolean'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { voter, proposal_id, support } = req.body;

    if (!stellarService.validateAddress(voter)) {
      return res.status(400).json({
        error: 'Invalid voter address',
      });
    }

    const result = await stellarService.submitContractTransaction({
      sourceKey: voter,
      contractId: stellarService.streamContractId,
      functionName: 'vote',
      args: [
        new stellarService.rpc.Address(voter),
        BigInt(proposal_id),
        support
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
 * /api/governance/proposal/{proposal_id}:
 *   get:
 *     summary: Get proposal information
 *     description: Get detailed information about a governance proposal
 *     tags: [Governance]
 *     parameters:
 *       - in: path
 *         name: proposal_id
 *         required: true
 *         schema:
 *           type: integer
 *           description: Proposal ID
 *     responses:
 *       200:
 *         description: Proposal information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 proposal:
 *                   type: object
 *                   description: Proposal details
 */
router.get('/proposal/:proposal_id', [
  param('proposal_id').isInt({ min: 1 }).withMessage('Invalid proposal ID'),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    const { proposal_id } = req.params;

    const result = await stellarService.callContractMethod({
      contractId: stellarService.streamContractId,
      functionName: 'get_proposal',
      args: [BigInt(proposal_id)]
    });

    res.json({
      success: true,
      proposal: result,
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;
