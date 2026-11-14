const { sql, getPool, request } = require('./base');

exports.findByStudent = async (studentId, sessionId) => {
  const r = await (await request())
    .input('st', sql.Int, studentId)
    .input('se', sql.Int, sessionId)
    .query(`SELECT ApplicationId AS applicationId, ApplicationNo AS applicationNo,
                   Status AS status, SubmittedAt AS submittedAt
            FROM AdmissionApplications WHERE StudentId = @st AND SessionId = @se`);
  return r.recordset[0];
};

exports.create = async ({ studentId, sessionId, sessionName, programId, specializationId }) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const r = await (await request(tx))
      .input('st', sql.Int, studentId)
      .input('se', sql.Int, sessionId)
      .input('p', sql.Int, programId)
      .input('sp', sql.Int, specializationId)
      .query(`INSERT INTO AdmissionApplications (StudentId, SessionId, ProgramId, SpecializationId)
              OUTPUT INSERTED.ApplicationId
              VALUES (@st, @se, @p, @sp)`);
    const id = r.recordset[0].ApplicationId;

    // Application number like APP/2026-2027/0001
    await (await request(tx))
      .input('id', sql.Int, id)
      .input('n', sql.VarChar, sessionName)
      .query(`UPDATE AdmissionApplications
              SET ApplicationNo = 'APP/' + @n + '/' + FORMAT(ApplicationId, '0000')
              WHERE ApplicationId = @id`);

    await tx.commit();
    return id;
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
};

// Returns true only if the application was still a Draft (protects against double submit)
exports.markSubmitted = async (applicationId, tx) => {
  const r = await (await request(tx))
    .input('id', sql.Int, applicationId)
    .query(`UPDATE AdmissionApplications
            SET Status = 'Submitted', SubmittedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
            WHERE ApplicationId = @id AND Status = 'Draft'`);
  return r.rowsAffected[0] > 0;
};