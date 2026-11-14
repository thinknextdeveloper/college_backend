require('dotenv').config({ override: true });
const nodemailer = require('nodemailer');

const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_PORT === '465',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

console.log('User:', process.env.SMTP_USER, '| Password length:', (process.env.SMTP_PASS || '').length);

t.verify()
  .then(() => console.log('SMTP login OK'))
  .catch((e) => console.error('FAILED:', e.message));