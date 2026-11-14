const { sql, request } = require('./base');

exports.listForProgram = async (programId, sessionId) => {
  const r = await (await request())
    .input('p', sql.Int, programId)
    .input('s', sql.Int, sessionId)
    .query(`SELECT FeeHead AS feeHead, Amount AS amount, IsPayableNow AS payableNow
            FROM FeeStructure
            WHERE ProgramId = @p AND SessionId = @s
            ORDER BY SortOrder, FeeStructureId`);
  return r.recordset;
};