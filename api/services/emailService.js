const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM = 'notifications@paystream.example',
} = process.env;

// Optional SMTP transport
const transporter =
  SMTP_HOST && SMTP_USER
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

// Track sent emails for testing/mock purposes
const sentEmails = [];

/**
 * Send an email if SMTP is configured, or simulate it.
 */
async function sendEmail({ to, subject, text }) {
  const emailRecord = {
    to,
    subject,
    text,
    timestamp: new Date().toISOString(),
    sent: false,
    simulated: false,
  };

  if (!to) {
    throw new Error('Recipient email (to) is required');
  }

  if (transporter) {
    try {
      await transporter.sendMail({
        from: EMAIL_FROM,
        to,
        subject,
        text,
      });
      emailRecord.sent = true;
      console.log(`[EmailService] Email sent successfully to ${to}`);
    } catch (err) {
      console.error(`[EmailService] Email delivery failed to ${to}:`, err.message);
      throw err;
    }
  } else {
    emailRecord.simulated = true;
    console.log(`[EmailService] SMTP not configured. Simulating email send:
      To:      ${to}
      Subject: ${subject}
      Body:    ${text}`);
  }

  sentEmails.push(emailRecord);
  return emailRecord;
}

module.exports = {
  sendEmail,
  sentEmails,
};
