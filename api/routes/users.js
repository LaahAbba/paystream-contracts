// SPDX-License-Identifier: Apache-2.0
/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Off-chain user profile and preferences management (#336)
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const stellarService = require('../services/stellarService');
const dbService = require('../services/dbService');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * @swagger
 * /users/{address}:
 *   delete:
 *     summary: Request deletion of off-chain user data
 *     description: |
 *       Deletes all off-chain user data (preferences, notifications) for the specified Stellar address.
 *       Note: On-chain transaction history, escrows, and stream data cannot be deleted as they are permanently recorded on the Stellar blockchain.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/Address'
 *         description: Stellar address (G...) of the user
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to send the deletion confirmation to
 *     responses:
 *       200:
 *         description: User off-chain data successfully deleted and confirmation email sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 onChainWarning:
 *                   type: string
 *                 emailSent:
 *                   type: boolean
 *                 recipient:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Authentication required or invalid credentials
 *       403:
 *         description: Unauthorized to delete another user's data
 *       500:
 *         description: Internal server error
 */
router.delete(
  '/:address',
  [
    param('address')
      .isString()
      .matches(/^G[A-Z0-9]{55}$/)
      .withMessage('Invalid Stellar address format'),
    body('email')
      .optional()
      .isEmail()
      .withMessage('Invalid email format'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      const { address } = req.params;
      const { email: requestEmail } = req.body || {};

      // 1. Authorize: Users can only delete their own data, unless using an API key
      if (req.stellarAddress && req.stellarAddress !== address) {
        return res.status(403).json({
          error: 'Forbidden: You can only delete your own off-chain data.',
          code: 'FORBIDDEN_USER',
        });
      }

      // Validate address structure using stellarService
      if (!stellarService.validateAddress(address)) {
        return res.status(400).json({
          error: 'Invalid Stellar address',
        });
      }

      // 2. Fetch user email if not provided in the request body
      // We look in our preferences / stored off-chain data
      let userEmail = requestEmail;
      if (!userEmail) {
        const storedPrefs = dbService.inMemoryPrefs.get(address);
        if (storedPrefs && storedPrefs.email) {
          userEmail = storedPrefs.email;
        }
      }

      // If still no email found, we can look up if database is configured or fallback
      if (!userEmail && dbService.pool) {
        try {
          const { rows } = await dbService.pool.query(
            'SELECT email FROM user_preferences WHERE address = $1 LIMIT 1',
            [address]
          );
          if (rows.length > 0 && rows[0].email) {
            userEmail = rows[0].email;
          }
        } catch (dbErr) {
          console.warn('[UsersRouter] Failed to fetch email from DB:', dbErr.message);
        }
      }

      // Fallback/Default if no email is stored or provided
      if (!userEmail) {
        // Since confirmation email is required, we return a bad request if we cannot determine the email
        return res.status(400).json({
          error: 'Email address is required to send confirmation email',
          code: 'EMAIL_REQUIRED',
        });
      }

      // 3. Delete all off-chain user data
      const deleteResult = await dbService.deleteOffChainUserData(address);

      // 4. Send Confirmation Email
      const emailSubject = 'PayStream: Off-chain Data Deletion Request';
      const emailText = `Hello,

This email confirms that all of your off-chain data (preferences, notifications, etc.) associated with Stellar address ${address} has been permanently deleted from PayStream systems.

Important Notice:
Any on-chain transaction history, escrow balances, and active stream configurations cannot be deleted as they are permanently recorded on the public Stellar blockchain.

If you did not request this, please contact support immediately.

Best regards,
The PayStream Team`;

      let emailSent = false;
      try {
        await emailService.sendEmail({
          to: userEmail,
          subject: emailSubject,
          text: emailText,
        });
        emailSent = true;
      } catch (err) {
        console.error('[UsersRouter] Failed to send deletion confirmation email:', err.message);
      }

      // 5. Respond to client including the on-chain data warning
      return res.json({
        success: true,
        message: 'All off-chain user data has been successfully deleted.',
        onChainWarning: 'On-chain transaction history and stream data cannot be deleted as they are permanently recorded on the Stellar blockchain.',
        emailSent,
        recipient: userEmail,
      });

    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
