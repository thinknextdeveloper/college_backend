const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const c = require('../controllers/auth.controller');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
router.use(limiter);

router.post('/send-otp', c.sendOtp);
router.post('/verify-otp', c.verifyOtp);
router.post('/register', c.register);
router.post('/login', c.login);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.post('/change-password', c.changePassword);
router.get('/seed-student', c.seedTestStudent);
router.post('/seed-student', c.seedTestStudent);
router.get('/hash', c.generateHash);

module.exports = router;
