const { sql, request } = require('./base');

exports.listTypes = async () => {
  const r = await (await request()).query(
    'SELECT ProgramTypeId AS id, Name AS name FROM ProgramTypes ORDER BY Name'
  );
  return r.recordset;
};

exports.listPrograms = async (programTypeId) => {
  const r = await (await request())
    .input('t', sql.Int, programTypeId)
    .query('SELECT ProgramId AS id, Name AS name FROM Programs WHERE ProgramTypeId=@t AND IsActive=1 ORDER BY Name');
  return r.recordset;
};

exports.listSpecializations = async (programId) => {
  const r = await (await request())
    .input('p', sql.Int, programId)
    .query('SELECT SpecializationId AS id, Name AS name FROM Specializations WHERE ProgramId=@p AND IsActive=1 ORDER BY Name');
  return r.recordset;
};

exports.programExists = async (programId) => {
  const r = await (await request())
    .input('p', sql.Int, programId)
    .query('SELECT 1 AS x FROM Programs WHERE ProgramId=@p AND IsActive=1');
  return r.recordset.length > 0;
};

exports.specializationBelongs = async (specializationId, programId) => {
  const r = await (await request())
    .input('s', sql.Int, specializationId)
    .input('p', sql.Int, programId)
    .query('SELECT 1 AS x FROM Specializations WHERE SpecializationId=@s AND ProgramId=@p AND IsActive=1');
  return r.recordset.length > 0;
};