const router = require('express').Router();
const c = require('../controllers/lookup.controller');

router.get('/program-types', c.programTypes);
router.get('/programs', c.programs);
router.get('/specializations', c.specializations);

module.exports = router;