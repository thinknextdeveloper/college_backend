const { sql, request } = require('./base');

exports.countRecent = async (email, seconds = 60) => {
  const r = await (await request())
    .input('e', sql.NVarChar, email)
    .input('s', sql.Int, -seconds)
    .query(`SELECT COUNT(*) AS c FROM OTPVerification
            WHERE Email=@e AND Purpose='REGISTER'
              AND CreatedAt > DATEADD(SECOND, @s, SYSUTCDATETIME())`);
  return r.recordset[0].c;
};

exports.create = async (email, otpHash) => {
  await (await request())
    .input('e', sql.NVarChar, email)
    .input('h', sql.Char(64), otpHash)
    .query(`INSERT INTO OTPVerification (Email, OtpHash, Purpose, ExpiresAt)
            VALUES (@e, @h, 'REGISTER', DATEADD(MINUTE, 10, SYSUTCDATETIME()))`);
};

exports.findLatestPending = async (email) => {
  const r = await (await request())
    .input('e', sql.NVarChar, email)
    .query(`SELECT TOP 1 OtpId, OtpHash, Attempts FROM OTPVerification
            WHERE Email=@e AND Purpose='REGISTER' AND IsVerified=0 AND ExpiresAt > SYSUTCDATETIME()
            ORDER BY OtpId DESC`);
  return r.recordset[0];
};

exports.addAttempt = async (otpId) => {
  await (await request())
    .input('id', sql.BigInt, otpId)
    .query('UPDATE OTPVerification SET Attempts = Attempts + 1 WHERE OtpId=@id');
};

exports.markVerified = async (otpId) => {
  await (await request())
    .input('id', sql.BigInt, otpId)
    .query('UPDATE OTPVerification SET IsVerified=1 WHERE OtpId=@id');
};

exports.hasRecentVerified = async (email) => {
  const r = await (await request())
    .input('e', sql.NVarChar, email)
    .query(`SELECT TOP 1 OtpId FROM OTPVerification
            WHERE Email=@e AND Purpose='REGISTER' AND IsVerified=1
              AND CreatedAt > DATEADD(MINUTE, -30, SYSUTCDATETIME())
            ORDER BY OtpId DESC`);
  return r.recordset.length > 0;
};

exports.deleteForEmail = async (email, tx) => {
  await (await request(tx))
    .input('e', sql.NVarChar, email)
    .query(`DELETE FROM OTPVerification WHERE Email=@e AND Purpose='REGISTER'`);
};