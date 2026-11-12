const router = require('express').Router();
const c = require('../controllers/lookup.controller');

router.get('/program-types', c.programTypes);
router.get('/programs', c.programs);
router.get('/specializations', c.specializations);
router.get('/countries', c.countries);
router.get('/states', c.states);
router.get('/cities', c.cities);
router.get('/dropdowns', c.dropdowns);

module.exports = router;
