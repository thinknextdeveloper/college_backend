const ProgramModel = require('../models/programmodel');

exports.programTypes = async (req, res, next) => {
  try {
    res.json(await ProgramModel.listTypes());
  } catch (e) { next(e); }
};

exports.programs = async (req, res, next) => {
  try {
    const typeId = parseInt(req.query.programTypeId, 10);
    res.json(typeId ? await ProgramModel.listPrograms(typeId) : []);
  } catch (e) { next(e); }
};

exports.specializations = async (req, res, next) => {
  try {
    const programId = parseInt(req.query.programId, 10);
    res.json(programId ? await ProgramModel.listSpecializations(programId) : []);
  } catch (e) { next(e); }
};