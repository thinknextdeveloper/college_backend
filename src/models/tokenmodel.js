const { sql, request } = require('./base');

exports.save = async (userId, tokenHash) => {
  await (await request())
    .input('u', sql.Int, userId)
    .input('h', sql.Char(64), tokenHash)
    .query(`INSERT INTO RefreshTokens (UserId, TokenHash, ExpiresAt)
            VALUES (@u, @h, DATEADD(DAY, 7, SYSUTCDATETIME()))`);
};

exports.findValid = async (tokenHash) => {
  const r = await (await request())
    .input('h', sql.Char(64), tokenHash)
    .query(`SELECT t.TokenId, u.UserId, u.Email, u.IsActive, ro.RoleName
            FROM RefreshTokens t
            JOIN Users u ON u.UserId = t.UserId
            JOIN Roles ro ON ro.RoleId = u.RoleId
            WHERE t.TokenHash=@h AND t.RevokedAt IS NULL AND t.ExpiresAt > SYSUTCDATETIME()`);
  return r.recordset[0];
};

exports.revokeById = async (tokenId) => {
  await (await request())
    .input('id', sql.BigInt, tokenId)
    .query('UPDATE RefreshTokens SET RevokedAt = SYSUTCDATETIME() WHERE TokenId=@id');
};

exports.revokeByHash = async (tokenHash) => {
  await (await request())
    .input('h', sql.Char(64), tokenHash)
    .query('UPDATE RefreshTokens SET RevokedAt = SYSUTCDATETIME() WHERE TokenHash=@h AND RevokedAt IS NULL');
};

//added 


exports.revokeAllForUser = async (userId) => {
  await (await request())
    .input('u', sql.Int, userId)
    .query('UPDATE RefreshTokens SET RevokedAt = SYSUTCDATETIME() WHERE UserId = @u AND RevokedAt IS NULL');
};