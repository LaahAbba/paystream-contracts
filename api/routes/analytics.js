const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');
const { query, param, validationResult } = require('express-validator');

/**
 * @swagger
 * /api/analytics/summary:
 *   get:
 *     summary: Get platform-wide stream analytics
 *     tags: [Analytics]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Analytics summary
 */
router.get(
  '/summary',
  [
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { startDate, endDate } = req.query;
      const stats = await analyticsService.getSummary(startDate, endDate);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @swagger
 * /api/analytics/employer/{address}:
 *   get:
 *     summary: Get analytics for a specific employer
 *     tags: [Analytics]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 */
router.get(
  '/employer/:address',
  [
    param('address').isString().notEmpty(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { address } = req.params;
      const { startDate, endDate } = req.query;
      const stats = await analyticsService.getEmployerStats(address, startDate, endDate);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
