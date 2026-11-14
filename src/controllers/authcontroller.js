const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');
const { sql, getPool } = require('../models/base');
const UserModel = require('../models/usermodel');
const StudentModel = require('../models/studentmodel');
const OtpModel = require('../models/otpmodel');
const TokenModel = require('../models/tokenmodel');
const ProgramModel = require('../models/programmodel');
const { sendOtpMail } = require('../utils/mailer');

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(150);
const mobileSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password needs an uppercase letter')
  .regex(/[a-z]/, 'Password needs a lowercase letter')
  .regex(/\d/, 'Password needs a number');

const hmac = (v) => crypto.createHmac('sha256', process.env.OTP_SECRET).update(v).digest('hex');
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// user = { UserId, RoleName }
async function issueTokens(user, res) {
  const accessToken = jwt.sign(
    { id: user.UserId, role: user.RoleName },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
  const refresh = crypto.randomBytes(48).toString('hex');
  await TokenModel.save(user.UserId, sha(refresh));
  res.cookie('refreshToken', refresh, cookieOpts);
  return accessToken;
}

exports.sendOtp = async (req, res, next) => {
  try {
    const email = emailSchema.parse(req.body.email);

    if (await UserModel.emailExists(email)) {
      return res.status(409).json({ message: 'This email is already registered' });
    }
    if ((await OtpModel.countRecent(email, 60)) > 0) {
      return res.status(429).json({ message: 'Please wait 60 seconds before requesting another OTP' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    await OtpModel.create(email, hmac(email + otp));
    await sendOtpMail(email, otp);

    res.json({ message: 'OTP sent to your email' });
  } catch (e) { next(e); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const email = emailSchema.parse(req.body.email);
    const otp = z.string().regex(/^\d{6}$/, 'OTP must be 6 digits').parse(req.body.otp);

    const row = await OtpModel.findLatestPending(email);
    if (!row) return res.status(400).json({ message: 'OTP expired. Please request a new one' });
    if (row.Attempts >= 5) return res.status(429).json({ message: 'Too many attempts. Request a new OTP' });

    const ok = crypto.timingSafeEqual(Buffer.from(hmac(email + otp)), Buffer.from(row.OtpHash));
    if (!ok) {
      await OtpModel.addAttempt(row.OtpId);
      return res.status(400).json({ message: 'Incorrect OTP' });
    }

    await OtpModel.markVerified(row.OtpId);
    res.json({ message: 'Email verified' });
  } catch (e) { next(e); }
};

const registerSchema = z
  .object({
    programId: z.coerce.number().int().positive('Select a program'),
    specializationId: z.coerce.number().int().positive().optional().nullable(),
    candidateName: z.string().trim().min(3, 'Enter the candidate name').max(150)
      .regex(/^[A-Za-z .'-]+$/, 'Name can contain letters only'),
    email: emailSchema,
    mobile: mobileSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match' });

// Public route: no login needed. Also signs the new student in (sets the session cookie).
exports.register = async (req, res, next) => {
  let tx;
  try {
    const d = registerSchema.parse({
      ...req.body,
      specializationId: req.body.specializationId || null,
    });

    if (!(await OtpModel.hasRecentVerified(d.email))) {
      return res.status(400).json({ message: 'Please verify your email with OTP first' });
    }
    if (!(await ProgramModel.programExists(d.programId))) {
      return res.status(400).json({ message: 'Invalid program' });
    }
    if (d.specializationId && !(await ProgramModel.specializationBelongs(d.specializationId, d.programId))) {
      return res.status(400).json({ message: 'Invalid specialization for this program' });
    }

    const passwordHash = await bcrypt.hash(d.password, 12);

    const pool = await getPool();
    tx = new sql.Transaction(pool);
    await tx.begin();

    const userId = await UserModel.createStudentUser(
      { email: d.email, mobile: d.mobile, passwordHash },
      tx
    );
    await StudentModel.create(
      {
        userId,
        candidateName: d.candidateName,
        programId: d.programId,
        specializationId: d.specializationId,
      },
      tx
    );
    await OtpModel.deleteForEmail(d.email, tx);

    await tx.commit();

    // auto sign-in: the frontend then calls /auth/refresh to load the user
    await issueTokens({ UserId: userId, RoleName: 'Student' }, res);
    res.status(201).json({ message: 'Registration successful' });
  } catch (e) {
    if (tx) { try { await tx.rollback(); } catch {} }
    next(e);
  }
};

exports.login = async (req, res, next) => {
  try {
    const email = emailSchema.parse(req.body.email);
    const password = z.string().min(1, 'Enter your password').parse(req.body.password);

    const user = await UserModel.findForLogin(email);
    const ok = user && (await bcrypt.compare(password, user.PasswordHash));
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    if (!user.IsActive) return res.status(403).json({ message: 'Your account is disabled' });

    const accessToken = await issueTokens(user, res);
    res.json({ accessToken, user: { id: user.UserId, email: user.Email, role: user.RoleName } });
  } catch (e) { next(e); }
};

exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token' });

    const row = await TokenModel.findValid(sha(token));
    if (!row || !row.IsActive) return res.status(401).json({ message: 'Session expired' });

    await TokenModel.revokeById(row.TokenId);
    const accessToken = await issueTokens(row, res);
    res.json({ accessToken, user: { id: row.UserId, email: row.Email, role: row.RoleName } });
  } catch (e) { next(e); }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) await TokenModel.revokeByHash(sha(token));
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  } catch (e) { next(e); }
};

//added

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'New passwords do not match' });

exports.changePassword = async (req, res, next) => {
  try {
    const d = changePasswordSchema.parse(req.body);
    const user = await UserModel.findPasswordById(req.user.id);
    if (!user || !(await bcrypt.compare(d.currentPassword, user.PasswordHash))) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    if (d.currentPassword === d.newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }
    await UserModel.updatePassword(user.UserId, await bcrypt.hash(d.newPassword, 12));
    await TokenModel.revokeAllForUser(user.UserId); // signs out other devices
    const accessToken = await issueTokens({ UserId: user.UserId, RoleName: req.user.role }, res);
    res.json({ message: 'Password updated successfully', accessToken });
  } catch (e) { next(e); }
};