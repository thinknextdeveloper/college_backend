const { sql, getPool } = require('../config/db');

exports.programTypes = async (req, res, next) => {
  try {
    const pool = await getPool();
    const r = await pool.request().query('SELECT ProgramTypeId AS id, Name AS name FROM ProgramTypes ORDER BY Name');
    res.json(r.recordset);
  } catch (e) { next(e); }
};

exports.programs = async (req, res, next) => {
  try {
    const typeId = parseInt(req.query.programTypeId, 10);
    if (!typeId) return res.json([]);
    const pool = await getPool();
    const r = await pool.request().input('t', sql.Int, typeId).query(
      'SELECT ProgramId AS id, Name AS name FROM Programs WHERE ProgramTypeId=@t AND IsActive=1 ORDER BY Name'
    );
    res.json(r.recordset);
  } catch (e) { next(e); }
};

exports.specializations = async (req, res, next) => {
  try {
    const programId = parseInt(req.query.programId, 10);
    if (!programId) return res.json([]);
    const pool = await getPool();
    const r = await pool.request().input('p', sql.Int, programId).query(
      'SELECT SpecializationId AS id, Name AS name FROM Specializations WHERE ProgramId=@p AND IsActive=1 ORDER BY Name'
    );
    res.json(r.recordset);
  } catch (e) { next(e); }
};