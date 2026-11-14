const { ZodError } = require('zod');
const multer = require('multer');

module.exports = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: err.issues[0].message });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: err.code === 'LIMIT_FILE_SIZE' ? 'File must be 2 MB or smaller' : 'Invalid file upload',
    });
  }
  if (err.expose && err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err.number === 2627 || err.number === 2601) {
    const isUser = /Users/i.test(String(err.message));
    return res.status(409).json({
      message: isUser ? 'Email or mobile number is already registered' : 'This record already exists',
    });
  }
  console.error(err.message);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
};