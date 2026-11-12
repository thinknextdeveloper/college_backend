const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { z } = require('zod');
const { sql, getPool } = require('../config/db');
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

async function issueTokens(pool, user, res) {
  const accessToken = jwt.sign(
    { id: user.UserId, role: user.RoleName },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
  const refresh = crypto.randomBytes(48).toString('hex');
  await pool
    .request()
    .input('u', sql.Int, user.UserId)
    .input('h', sql.Char(64), sha(refresh))
    .query(`INSERT INTO RefreshTokens (UserId, TokenHash, ExpiresAt)
            VALUES (@u, @h, DATEADD(DAY, 7, SYSUTCDATETIME()))`);
  res.cookie('refreshToken', refresh, cookieOpts);
  return accessToken;
}

exports.sendOtp = async (req, res, next) => {
  try {
    const email = emailSchema.parse(req.body.email);
    const pool = await getPool();

    const exists = await pool.request().input('e', sql.NVarChar, email)
      .query('SELECT 1 AS x FROM Users WHERE Email = @e');
    if (exists.recordset.length) return res.status(409).json({ message: 'This email is already registered' });

    const recent = await pool.request().input('e', sql.NVarChar, email).query(
      `SELECT COUNT(*) AS c FROM OTPVerification
       WHERE Email=@e AND Purpose='REGISTER' AND CreatedAt > DATEADD(SECOND,-60,SYSUTCDATETIME())`
    );
    if (recent.recordset[0].c > 0) {
      return res.status(429).json({ message: 'Please wait 60 seconds before requesting another OTP' });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    await pool.request()
      .input('e', sql.NVarChar, email)
      .input('h', sql.Char(64), hmac(email + otp))
      .query(`INSERT INTO OTPVerification (Email, OtpHash, Purpose, ExpiresAt)
              VALUES (@e, @h, 'REGISTER', DATEADD(MINUTE, 10, SYSUTCDATETIME()))`);

    await sendOtpMail(email, otp);
    res.json({ message: 'OTP sent to your email' });
  } catch (e) { next(e); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const email = emailSchema.parse(req.body.email);
    const otp = z.string().regex(/^\d{6}$/, 'OTP must be 6 digits').parse(req.body.otp);
    const pool = await getPool();

    const r = await pool.request().input('e', sql.NVarChar, email).query(
      `SELECT TOP 1 OtpId, OtpHash, Attempts FROM OTPVerification
       WHERE Email=@e AND Purpose='REGISTER' AND IsVerified=0 AND ExpiresAt > SYSUTCDATETIME()
       ORDER BY OtpId DESC`
    );
    const row = r.recordset[0];
    if (!row) return res.status(400).json({ message: 'OTP expired. Please request a new one' });
    if (row.Attempts >= 5) return res.status(429).json({ message: 'Too many attempts. Request a new OTP' });

    const ok = crypto.timingSafeEqual(Buffer.from(hmac(email + otp)), Buffer.from(row.OtpHash));
    if (!ok) {
      await pool.request().input('id', sql.BigInt, row.OtpId)
        .query('UPDATE OTPVerification SET Attempts = Attempts + 1 WHERE OtpId=@id');
      return res.status(400).json({ message: 'Incorrect OTP' });
    }
    await pool.request().input('id', sql.BigInt, row.OtpId)
      .query('UPDATE OTPVerification SET IsVerified=1 WHERE OtpId=@id');
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

exports.register = async (req, res, next) => {
  let tx;
  try {
    const d = registerSchema.parse({
      ...req.body,
      specializationId: req.body.specializationId || null,
    });
    const pool = await getPool();

    const otp = await pool.request().input('e', sql.NVarChar, d.email).query(
      `SELECT TOP 1 OtpId FROM OTPVerification
       WHERE Email=@e AND Purpose='REGISTER' AND IsVerified=1
         AND CreatedAt > DATEADD(MINUTE,-30,SYSUTCDATETIME())
       ORDER BY OtpId DESC`
    );
    if (!otp.recordset.length) return res.status(400).json({ message: 'Please verify your email with OTP first' });

    const prog = await pool.request().input('p', sql.Int, d.programId)
      .query('SELECT 1 AS x FROM Programs WHERE ProgramId=@p AND IsActive=1');
    if (!prog.recordset.length) return res.status(400).json({ message: 'Invalid program' });

    if (d.specializationId) {
      const sp = await pool.request()
        .input('s', sql.Int, d.specializationId).input('p', sql.Int, d.programId)
        .query('SELECT 1 AS x FROM Specializations WHERE SpecializationId=@s AND ProgramId=@p AND IsActive=1');
      if (!sp.recordset.length) return res.status(400).json({ message: 'Invalid specialization for this program' });
    }

    const hash = await bcrypt.hash(d.password, 12);
    tx = new sql.Transaction(pool);
    await tx.begin();

    const u = await new sql.Request(tx)
      .input('email', sql.NVarChar, d.email)
      .input('mobile', sql.VarChar, d.mobile)
      .input('hash', sql.NVarChar, hash)
      .query(`INSERT INTO Users (RoleId, Email, Mobile, PasswordHash, IsEmailVerified)
              OUTPUT INSERTED.UserId
              VALUES ((SELECT RoleId FROM Roles WHERE RoleName='Student'), @email, @mobile, @hash, 1)`);

    await new sql.Request(tx)
      .input('uid', sql.Int, u.recordset[0].UserId)
      .input('name', sql.NVarChar, d.candidateName)
      .input('pid', sql.Int, d.programId)
      .input('sid', sql.Int, d.specializationId)
      .query(`INSERT INTO Students (UserId, CandidateName, ProgramId, SpecializationId)
              VALUES (@uid, @name, @pid, @sid)`);

    await new sql.Request(tx).input('e', sql.NVarChar, d.email)
      .query(`DELETE FROM OTPVerification WHERE Email=@e AND Purpose='REGISTER'`);

    await tx.commit();
    res.status(201).json({ message: 'Registration successful. You can now log in.' });
  } catch (e) {
    if (tx) { try { await tx.rollback(); } catch {} }
    next(e);
  }
};

exports.login = async (req, res, next) => {
  try {
    const email = emailSchema.parse(req.body.email);
    const password = z.string().min(1, 'Enter your password').parse(req.body.password);
    const pool = await getPool();

    const r = await pool.request().input('e', sql.NVarChar, email).query(
      `SELECT u.UserId, u.Email, u.PasswordHash, u.IsActive, r.RoleName
       FROM Users u JOIN Roles r ON r.RoleId = u.RoleId WHERE u.Email=@e`
    );
    const user = r.recordset[0];
    const ok = user && (await bcrypt.compare(password, user.PasswordHash));
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    if (!user.IsActive) return res.status(403).json({ message: 'Your account is disabled' });

    const accessToken = await issueTokens(pool, user, res);
    res.json({ accessToken, user: { id: user.UserId, email: user.Email, role: user.RoleName } });
  } catch (e) { next(e); }
};

exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token' });
    const pool = await getPool();

    const r = await pool.request().input('h', sql.Char(64), sha(token)).query(
      `SELECT t.TokenId, u.UserId, u.Email, u.IsActive, ro.RoleName
       FROM RefreshTokens t
       JOIN Users u ON u.UserId = t.UserId
       JOIN Roles ro ON ro.RoleId = u.RoleId
       WHERE t.TokenHash=@h AND t.RevokedAt IS NULL AND t.ExpiresAt > SYSUTCDATETIME()`
    );
    const row = r.recordset[0];
    if (!row || !row.IsActive) return res.status(401).json({ message: 'Session expired' });

    await pool.request().input('id', sql.BigInt, row.TokenId)
      .query('UPDATE RefreshTokens SET RevokedAt = SYSUTCDATETIME() WHERE TokenId=@id');
    const accessToken = await issueTokens(pool, row, res);
    res.json({ accessToken, user: { id: row.UserId, email: row.Email, role: row.RoleName } });
  } catch (e) { next(e); }
};

exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;
    if (token) {
      const pool = await getPool();
      await pool.request().input('h', sql.Char(64), sha(token))
        .query('UPDATE RefreshTokens SET RevokedAt = SYSUTCDATETIME() WHERE TokenHash=@h AND RevokedAt IS NULL');
    }
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  } catch (e) { next(e); }
};