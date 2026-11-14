const { sql, request } = require('./base');

exports.emailExists = async (email) => {
  const r = await (await request())
    .input('e', sql.NVarChar, email)
    .query('SELECT 1 AS x FROM Users WHERE Email = @e');
  return r.recordset.length > 0;
};

exports.findForLogin = async (email) => {
  const r = await (await request())
    .input('e', sql.NVarChar, email)
    .query(`SELECT u.UserId, u.Email, u.PasswordHash, u.IsActive, r.RoleName
            FROM Users u JOIN Roles r ON r.RoleId = u.RoleId
            WHERE u.Email = @e`);
  return r.recordset[0];
};

exports.createStudentUser = async ({ email, mobile, passwordHash }, tx) => {
  const r = await (await request(tx))
    .input('email', sql.NVarChar, email)
    .input('mobile', sql.VarChar, mobile)
    .input('hash', sql.NVarChar, passwordHash)
    .query(`INSERT INTO Users (RoleId, Email, Mobile, PasswordHash, IsEmailVerified)
            OUTPUT INSERTED.UserId
            VALUES ((SELECT RoleId FROM Roles WHERE RoleName = 'Student'), @email, @mobile, @hash, 1)`);
  return r.recordset[0].UserId;
};



//added 


exports.findPasswordById = async (userId) => {
  const r = await (await request())
    .input('u', sql.Int, userId)
    .query('SELECT UserId, PasswordHash FROM Users WHERE UserId = @u AND IsActive = 1');
  return r.recordset[0];
};

exports.updatePassword = async (userId, passwordHash) => {
  await (await request())
    .input('u', sql.Int, userId)
    .input('h', sql.NVarChar, passwordHash)
    .query('UPDATE Users SET PasswordHash = @h, UpdatedAt = SYSUTCDATETIME() WHERE UserId = @u');
};