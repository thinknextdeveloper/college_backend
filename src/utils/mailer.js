const nodemailer = require('nodemailer');

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendOtpMail(to, otp) {
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP not configured');
    console.log(`[DEV ONLY] OTP for ${to}: ${otp}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Your verification code',
    text: `Your OTP is ${otp}. It is valid for 10 minutes. Do not share it with anyone.`,
  });
}

module.exports = { sendOtpMail };