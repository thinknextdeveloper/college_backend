const { sql, request } = require('./base');

exports.create = async ({ userId, candidateName, programId, specializationId }, tx) => {
  await (await request(tx))
    .input('uid', sql.Int, userId)
    .input('name', sql.NVarChar, candidateName)
    .input('pid', sql.Int, programId)
    .input('sid', sql.Int, specializationId)
    .query(`INSERT INTO Students (UserId, CandidateName, ProgramId, SpecializationId)
            VALUES (@uid, @name, @pid, @sid)`);
};

exports.findByUserId = async (userId) => {
  const r = await (await request())
    .input('u', sql.Int, userId)
    .query(`SELECT s.StudentId, s.CandidateName, s.ProgramId, s.SpecializationId,
                   p.Name AS ProgramName, p.DurationMonths, pt.Name AS ProgramType,
                   sp.Name AS SpecializationName, u.Email, u.Mobile
            FROM Students s
            JOIN Users u ON u.UserId = s.UserId
            JOIN Programs p ON p.ProgramId = s.ProgramId
            JOIN ProgramTypes pt ON pt.ProgramTypeId = p.ProgramTypeId
            LEFT JOIN Specializations sp ON sp.SpecializationId = s.SpecializationId
            WHERE s.UserId = @u`);
  return r.recordset[0];
};