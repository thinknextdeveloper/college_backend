const { sql, getPool } = require('../config/db');

exports.programTypes = async (req, res, next) => {
  try {
    const pool = await getPool();
    let r = [];
    try {
      const q = await pool.request().query('SELECT ProgramTypeId AS id, Name AS name FROM ProgramTypes ORDER BY Name');
      r = q.recordset || [];
    } catch {}
    if (!r.length) {
      r = [
        { id: 1, name: 'Undergraduate (UG)' },
        { id: 2, name: 'Postgraduate (PG)' },
        { id: 3, name: 'Diploma' },
      ];
    }
    res.json(r);
  } catch (e) { next(e); }
};

exports.programs = async (req, res, next) => {
  try {
    const typeId = parseInt(req.query.programTypeId, 10);
    const pool = await getPool();
    let r = [];
    if (typeId) {
      try {
        const q = await pool.request().input('t', sql.Int, typeId).query(
          'SELECT ProgramId AS id, Name AS name FROM Programs WHERE ProgramTypeId=@t AND IsActive=1 ORDER BY Name'
        );
        r = q.recordset || [];
      } catch {}
    }
    if (!r.length) {
      const defaultPrograms = {
        1: [
          { id: 101, name: 'B.Tech - Computer Science & Engineering' },
          { id: 102, name: 'B.Tech - Electrical & Electronics Engineering (EEE)' },
          { id: 103, name: 'B.Tech - Mechanical Engineering' },
          { id: 104, name: 'B.Tech - Civil Engineering' },
          { id: 105, name: 'BCA - Bachelor of Computer Applications' },
          { id: 106, name: 'BBA - Bachelor of Business Administration' },
        ],
        2: [
          { id: 201, name: 'M.Tech - Computer Science' },
          { id: 202, name: 'MBA - Master of Business Administration' },
          { id: 203, name: 'MCA - Master of Computer Applications' },
        ],
        3: [
          { id: 301, name: 'Diploma - Electrical Engineering' },
          { id: 302, name: 'Diploma - Mechanical Engineering' },
          { id: 303, name: 'Diploma - Civil Engineering' },
        ],
      };
      r = defaultPrograms[typeId] || (typeId ? [] : [
        { id: 101, name: 'B.Tech - Computer Science & Engineering' },
        { id: 102, name: 'B.Tech - Electrical & Electronics Engineering (EEE)' },
      ]);
    }
    res.json(r);
  } catch (e) { next(e); }
};

exports.specializations = async (req, res, next) => {
  try {
    const programId = parseInt(req.query.programId, 10);
    const pool = await getPool();
    let r = [];
    if (programId) {
      try {
        const q = await pool.request().input('p', sql.Int, programId).query(
          'SELECT SpecializationId AS id, Name AS name FROM Specializations WHERE ProgramId=@p AND IsActive=1 ORDER BY Name'
        );
        r = q.recordset || [];
      } catch {}
    }
    if (!r.length) {
      const defaultSpecializations = {
        101: [
          { id: 1001, name: 'Artificial Intelligence & Machine Learning' },
          { id: 1002, name: 'Cloud Computing & Cyber Security' },
          { id: 1003, name: 'Data Science & Big Data' },
        ],
        102: [
          { id: 1004, name: 'Power Systems & Energy Management' },
          { id: 1005, name: 'Control Systems & Instrumentation' },
        ],
        202: [
          { id: 2001, name: 'Finance & Banking' },
          { id: 2002, name: 'Marketing & Sales' },
          { id: 2003, name: 'Human Resource Management' },
        ],
      };
      r = defaultSpecializations[programId] || [
        { id: 9999, name: 'General Specialization' },
      ];
    }
    res.json(r);
  } catch (e) { next(e); }
};

exports.countries = async (req, res) => {
  res.json([
    { id: 'India', name: 'India' },
    { id: 'Nepal', name: 'Nepal' },
    { id: 'Bhutan', name: 'Bhutan' },
    { id: 'Bangladesh', name: 'Bangladesh' },
    { id: 'Other', name: 'Other' },
  ]);
};

exports.states = async (req, res) => {
  res.json([
    { id: 'Andhra Pradesh', name: 'Andhra Pradesh' },
    { id: 'Bihar', name: 'Bihar' },
    { id: 'Delhi', name: 'Delhi' },
    { id: 'Gujarat', name: 'Gujarat' },
    { id: 'Haryana', name: 'Haryana' },
    { id: 'Jharkhand', name: 'Jharkhand' },
    { id: 'Karnataka', name: 'Karnataka' },
    { id: 'Madhya Pradesh', name: 'Madhya Pradesh' },
    { id: 'Maharashtra', name: 'Maharashtra' },
    { id: 'Punjab', name: 'Punjab' },
    { id: 'Rajasthan', name: 'Rajasthan' },
    { id: 'Tamil Nadu', name: 'Tamil Nadu' },
    { id: 'Telangana', name: 'Telangana' },
    { id: 'Uttar Pradesh', name: 'Uttar Pradesh' },
    { id: 'West Bengal', name: 'West Bengal' },
  ]);
};

exports.cities = async (req, res) => {
  const state = (req.query.state || '').toString();
  const cityMap = {
    'Bihar': [
      { id: 'Patna', name: 'Patna' },
      { id: 'Gaya', name: 'Gaya' },
      { id: 'Muzaffarpur', name: 'Muzaffarpur' },
      { id: 'Bhagalpur', name: 'Bhagalpur' },
      { id: 'Purnia', name: 'Purnia' },
    ],
    'Delhi': [
      { id: 'New Delhi', name: 'New Delhi' },
      { id: 'North Delhi', name: 'North Delhi' },
      { id: 'South Delhi', name: 'South Delhi' },
      { id: 'East Delhi', name: 'East Delhi' },
    ],
    'Uttar Pradesh': [
      { id: 'Lucknow', name: 'Lucknow' },
      { id: 'Noida', name: 'Noida' },
      { id: 'Kanpur', name: 'Kanpur' },
      { id: 'Varanasi', name: 'Varanasi' },
      { id: 'Agra', name: 'Agra' },
    ],
    'Maharashtra': [
      { id: 'Mumbai', name: 'Mumbai' },
      { id: 'Pune', name: 'Pune' },
      { id: 'Nagpur', name: 'Nagpur' },
      { id: 'Nashik', name: 'Nashik' },
    ],
    'Punjab': [
      { id: 'Chandigarh', name: 'Chandigarh' },
      { id: 'Ludhiana', name: 'Ludhiana' },
      { id: 'Amritsar', name: 'Amritsar' },
      { id: 'Jalandhar', name: 'Jalandhar' },
    ],
    'Haryana': [
      { id: 'Gurugram', name: 'Gurugram' },
      { id: 'Faridabad', name: 'Faridabad' },
      { id: 'Panipat', name: 'Panipat' },
      { id: 'Ambala', name: 'Ambala' },
    ],
    'Jharkhand': [
      { id: 'Ranchi', name: 'Ranchi' },
      { id: 'Jamshedpur', name: 'Jamshedpur' },
      { id: 'Dhanbad', name: 'Dhanbad' },
      { id: 'Bokaro', name: 'Bokaro' },
    ],
  };
  res.json(cityMap[state] || [
    { id: 'Central City', name: 'Central City' },
    { id: 'District Area', name: 'District Area' },
  ]);
};

exports.dropdowns = async (req, res) => {
  res.json({
    genders: [
      { id: 'Male', name: 'Male' },
      { id: 'Female', name: 'Female' },
      { id: 'Other', name: 'Other' },
    ],
    categories: [
      { id: 'General', name: 'General' },
      { id: 'OBC', name: 'OBC' },
      { id: 'SC', name: 'SC' },
      { id: 'ST', name: 'ST' },
      { id: 'EWS', name: 'EWS' },
    ],
    religions: [
      { id: 'Hindu', name: 'Hindu' },
      { id: 'Muslim', name: 'Muslim' },
      { id: 'Sikh', name: 'Sikh' },
      { id: 'Christian', name: 'Christian' },
      { id: 'Jain', name: 'Jain' },
      { id: 'Buddhist', name: 'Buddhist' },
      { id: 'Other', name: 'Other' },
    ],
    nationalities: [
      { id: 'Indian', name: 'Indian' },
      { id: 'NRI', name: 'NRI' },
      { id: 'Foreign National', name: 'Foreign National' },
    ],
    sessions: [
      { id: '2026-2027', name: '2026-2027' },
      { id: '2025-2026', name: '2025-2026' },
    ],
    lateralEntry: [
      { id: 'No', name: 'No' },
      { id: 'Yes', name: 'Yes' },
    ],
  });
};
