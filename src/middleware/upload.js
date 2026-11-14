const multer = require('multer');
const path = require('path');
const fs = require('fs');
const httpError = require('../utils/httpError');

const PHOTO_DIR = path.join(__dirname, '..', '..', 'uploads', 'photos');
const DOC_DIR = path.join(__dirname, '..', '..', 'uploads', 'documents');
fs.mkdirSync(PHOTO_DIR, { recursive: true });
fs.mkdirSync(DOC_DIR, { recursive: true });

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const makeUpload = (allowed, message, field) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const ok = !!allowed[file.mimetype] && allowed[file.mimetype].includes(ext);
      cb(ok ? null : httpError(400, message), ok);
    },
  }).single(field);

// Passport photo: images only
const photoUpload = makeUpload(
  { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
  'Only JPG, JPEG or PNG images are allowed',
  'photo'
);

// Other documents: images or PDF (the controller enforces image-only types such as the signature)
const docUpload = makeUpload(
  { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'application/pdf': ['.pdf'] },
  'Only PDF, JPG, JPEG or PNG files are allowed',
  'file'
);

module.exports = { photoUpload, docUpload, PHOTO_DIR, DOC_DIR };