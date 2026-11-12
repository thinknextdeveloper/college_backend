const { ZodError } = require('zod');

module.exports = (err, req, res, next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: err.issues[0].message });
  }
  if (err.number === 2627 || err.number === 2601) {
    return res.status(409).json({ message: 'Email or mobile number is already registered' });
  }
  console.error(err.message);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
};