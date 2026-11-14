const StudentModel = require('../models/studentmodel');

// Loads the logged-in student's row into req.student
module.exports = async (req, res, next) => {
  try {
    const student = await StudentModel.findByUserId(req.user.id);
    if (!student) return res.status(404).json({ message: 'Student profile not found' });
    req.student = student;
    next();
  } catch (e) {
    next(e);
  }
};