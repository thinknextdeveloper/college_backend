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

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to, // the email the student entered on the registration form
      subject: 'Your verification code',
      text: `Your OTP is ${otp}. It is valid for 10 minutes. Do not share it with anyone.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px">
          <h2 style="color:#0b3d91;margin-top:0">Email Verification</h2>
          <p>Use this code to verify your email for admission registration:</p>
          <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#0b3d91;margin:16px 0">${otp}</p>
          <p style="color:#64748b;font-size:13px">Valid for 10 minutes. Do not share this code with anyone.</p>
        </div>`,
    });
  } catch (err) {
    console.error('Email send failed:', err.message);
    throw err;
  }
}

module.exports = { sendOtpMail };