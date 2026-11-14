const { sql, request } = require('./base');

exports.listByApplication = async (applicationId) => {
  const r = await (await request()).input('a', sql.Int, applicationId).query(
    `SELECT PaymentId AS paymentId, Amount AS amount, Status AS status, Method AS method,
            TransactionRef AS transactionRef, PaidAt AS paidAt
     FROM Payments WHERE ApplicationId = @a ORDER BY PaymentId DESC`
  );
  return r.recordset;
};

exports.recordPaid = async ({ applicationId, amount, method, transactionRef }, tx) => {
  await (await request(tx))
    .input('a', sql.Int, applicationId)
    .input('m', sql.Decimal(10, 2), amount)
    .input('me', sql.VarChar, method)
    .input('t', sql.VarChar, transactionRef)
    .query(`INSERT INTO Payments (ApplicationId, Amount, Status, Method, TransactionRef, PaidAt)
            VALUES (@a, @m, 'Paid', @me, @t, SYSUTCDATETIME())`);
};