const { request } = require('./base');

exports.getActive = async () => {
  const r = await (await request()).query(
    `SELECT TOP 1 SessionId, Name FROM AdmissionSessions WHERE IsActive = 1 ORDER BY SessionId DESC`
  );
  return r.recordset[0];
};