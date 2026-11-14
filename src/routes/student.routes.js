const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const attachStudent = require('../middleware/student');
const { photoUpload, docUpload } = require('../middleware/upload');
const c = require('../controllers/student.controller');

router.use(authenticate, authorize('Student'), attachStudent);

router.get('/overview', c.overview);
router.post('/application/start', c.startApplication);
router.put('/application/personal', c.savePersonal);
router.put('/application/education', c.saveEducation);

router.post('/application/photo', photoUpload, c.uploadPhoto);
router.get('/application/photo', c.getPhoto);

router.post('/application/documents/:docType', docUpload, c.uploadDocument);
router.get('/application/documents/:docType', c.getDocumentFile);
router.delete('/application/documents/:docType', c.removeDocument);

router.post('/payments/pay', c.pay);

module.exports = router;