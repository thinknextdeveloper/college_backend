const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const { sql, getPool } = require('../models/base');
const SessionModel = require('../models/session.model');
const ApplicationModel = require('../models/application.model');
const ProfileModel = require('../models/profile.model');
const FeeModel = require('../models/fee.model');
const PaymentModel = require('../models/payment.model');
const httpError = require('../utils/httpError');
const DocumentModel = require('../models/document.model');
const { PHOTO_DIR, DOC_DIR } = require('../middleware/upload');
const round2 = (n) => Math.round(n * 100) / 100;
const s = (v) => (v == null ? '' : String(v).trim());
// Detect the real image type from the file's first bytes (extension and mimetype can be faked)
const SIGNATURES = [
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) =>
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------- overview
// Which documents this student must / may upload, based on what they filled in
function documentRows(types, uploaded, personal, education) {
  const byType = new Map(uploaded.map((d) => [d.docType, d]));
  const reserved = !!(personal && personal.category && personal.category !== 'General');
  const rows = [];
  for (const t of types) {
    let applicable = true;
    let required = false;
    if (t.requiredWhen === 'ALWAYS') required = true;
    else if (t.requiredWhen === 'DIPLOMA') { applicable = !!education.diploma; required = applicable; }
    else if (t.requiredWhen === 'CATEGORY') { applicable = reserved; required = reserved; }
    if (!applicable) continue;
    rows.push({
      docType: t.docType,
      label: t.label,
      required,
      allowPdf: !!t.allowPdf,
      uploaded: byType.get(t.docType) || null,
    });
  }
  return rows;
}

async function buildOverview(student) {
  const session = await SessionModel.getActive();
  const application = session
    ? await ApplicationModel.findByStudent(student.StudentId, session.SessionId)
    : null;

  const [personal, eduRows, photo, fees, payments, docTypes, docsUploaded] = await Promise.all([
    ProfileModel.getPersonal(student.StudentId),
    ProfileModel.listEducation(student.StudentId),
    ProfileModel.getDocument(student.StudentId, 'PHOTO'),
    session ? FeeModel.listForProgram(student.ProgramId, session.SessionId) : [],
    application ? PaymentModel.listByApplication(application.applicationId) : [],
    DocumentModel.listTypes(),
    DocumentModel.listForStudent(student.StudentId),
  ]);

  const education = { tenth: null, twelfth: null, diploma: null };
  for (const e of eduRows) {
    const { level, ...row } = e;
    if (level === '10TH') education.tenth = row;
    if (level === '12TH') education.twelfth = row;
    if (level === 'DIPLOMA') education.diploma = row;
  }

  const docItems = documentRows(docTypes, docsUploaded, personal, education);
  const paid = payments.some((p) => p.status === 'Paid');
  const steps = {
    personal: !!personal,
    education: !!(education.tenth && education.twelfth),
    photo: !!photo,
    documents: docItems.filter((d) => d.required).every((d) => d.uploaded),
    payment: paid,
  };
  const done = Object.values(steps).filter(Boolean).length;

  return {
    student: {
      name: student.CandidateName,
      email: student.Email,
      mobile: student.Mobile,
      programType: student.ProgramType,
      program: student.ProgramName,
      specialization: student.SpecializationName,
      durationMonths: student.DurationMonths,
    },
    session: session ? session.Name : null,
    application: application || null,
    personal: personal || null,
    education,
    photo: photo ? { uploadedAt: photo.UploadedAt, sizeBytes: photo.SizeBytes } : null,
    documents: { items: docItems },
    fees: {
      items: fees,
      payableNow: round2(fees.filter((f) => f.payableNow).reduce((t, f) => t + Number(f.amount), 0)),
      total: round2(fees.reduce((t, f) => t + Number(f.amount), 0)),
      paymentMode: process.env.PAYMENT_MODE || 'off',
    },
    payments,
    steps,
    progress: Math.round((done / 5) * 100),
    editable: !application || application.status === 'Draft',
  };
}

async function assertEditable(student) {
  const session = await SessionModel.getActive();
  if (!session) return;
  const app = await ApplicationModel.findByStudent(student.StudentId, session.SessionId);
  if (app && app.status !== 'Draft') {
    throw httpError(409, 'Your application is already submitted and can no longer be edited');
  }
}

exports.overview = h(async (req, res) => {
  res.json(await buildOverview(req.student));
});

exports.startApplication = h(async (req, res) => {
  const session = await SessionModel.getActive();
  if (!session) throw httpError(400, 'Admissions are not open right now');
  const existing = await ApplicationModel.findByStudent(req.student.StudentId, session.SessionId);
  if (!existing) {
    await ApplicationModel.create({
      studentId: req.student.StudentId,
      sessionId: session.SessionId,
      sessionName: session.Name,
      programId: req.student.ProgramId,
      specializationId: req.student.SpecializationId,
    });
  }
  res.json(await buildOverview(req.student));
});

// ---------------------------------------------------------------- personal
const nameRx = /^[A-Za-z .'-]+$/;
const optNameRx = /^[A-Za-z .'-]*$/;

const dobSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date of birth')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 14 && age <= 60;
  }, 'Enter a valid date of birth');

const personalSchema = z
  .object({
    firstName: z.string().min(1, 'Enter first name').max(60).regex(nameRx, 'First name can contain letters only'),
    middleName: z.string().max(60).regex(optNameRx, 'Middle name can contain letters only'),
    lastName: z.string().max(60).regex(optNameRx, 'Last name can contain letters only'),
    dateOfBirth: dobSchema,
    gender: z.enum(['Male', 'Female', 'Other']),
    category: z.enum(['General', 'OBC', 'SC', 'ST', 'EWS']),
    religion: z.string().max(40),
    nationality: z.string().min(2, 'Enter nationality').max(40),
    aadhaar: z.string().regex(/^(\d{12})?$/, 'Aadhaar number must be 12 digits'),
    fatherName: z.string().min(3, "Enter father's name").max(120).regex(nameRx, "Father's name can contain letters only"),
    fatherMobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit father's mobile number"),
    motherName: z.string().min(3, "Enter mother's name").max(120).regex(nameRx, "Mother's name can contain letters only"),
    addressLine: z.string().min(5, 'Enter your address').max(250),
    city: z.string().min(2, 'Enter your city').max(80),
    state: z.string().min(2, 'Select your state').max(80),
    pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
    isPermanentSame: z.boolean(),
    permanentAddress: z.string().max(400),
  })
  .refine((d) => d.isPermanentSame || d.permanentAddress.length >= 5, {
    message: 'Enter your permanent address',
    path: ['permanentAddress'],
  });

exports.savePersonal = h(async (req, res) => {
  const b = req.body || {};
  const d = personalSchema.parse({
    firstName: s(b.firstName),
    middleName: s(b.middleName),
    lastName: s(b.lastName),
    dateOfBirth: s(b.dateOfBirth),
    gender: s(b.gender),
    category: s(b.category),
    religion: s(b.religion),
    nationality: s(b.nationality) || 'Indian',
    aadhaar: s(b.aadhaar).replace(/\s/g, ''),
    fatherName: s(b.fatherName),
    fatherMobile: s(b.fatherMobile),
    motherName: s(b.motherName),
    addressLine: s(b.addressLine),
    city: s(b.city),
    state: s(b.state),
    pincode: s(b.pincode),
    isPermanentSame: b.isPermanentSame !== false,
    permanentAddress: s(b.permanentAddress),
  });
  await assertEditable(req.student);
  await ProfileModel.upsertPersonal(req.student.StudentId, d);
  res.json(await buildOverview(req.student));
});

// ---------------------------------------------------------------- education
const maxYear = () => new Date().getFullYear();
const eduRow = z.object({
  board: z.string().min(2, 'Enter board / university').max(150),
  institute: z.string().min(2, 'Enter school / institute name').max(200),
  stream: z.string().max(100),
  rollNo: z.string().max(40),
  passingYear: z
    .number()
    .int()
    .min(1990, 'Enter a valid passing year')
    .refine((y) => y <= maxYear(), 'Enter a valid passing year'),
  percentage: z.number().min(0, 'Percentage must be between 0 and 100').max(100, 'Percentage must be between 0 and 100'),
});
const educationSchema = z.object({
  tenth: eduRow,
  twelfth: eduRow,
  diploma: eduRow.refine((d) => d.stream.length > 0, 'Enter your diploma branch').nullable(),
});

const cleanEdu = (r) =>
  r
    ? {
        board: s(r.board),
        institute: s(r.institute),
        stream: s(r.stream),
        rollNo: s(r.rollNo),
        passingYear: Number(r.passingYear),
        percentage: Number(r.percentage),
      }
    : null;

exports.saveEducation = h(async (req, res) => {
  const b = req.body || {};
  const d = educationSchema.parse({
    tenth: cleanEdu(b.tenth),
    twelfth: cleanEdu(b.twelfth),
    diploma: cleanEdu(b.diploma),
  });
  await assertEditable(req.student);
  await ProfileModel.saveEducation(req.student.StudentId, d);
  res.json(await buildOverview(req.student));
});

// ---------------------------------------------------------------- photo
exports.uploadPhoto = h(async (req, res) => {
  const file = req.file;
  if (!file) throw httpError(400, 'Choose a JPG, JPEG or PNG photo');
  const b = file.buffer;

  const kind = SIGNATURES.find((k) => k.test(b));
  if (!kind) throw httpError(400, 'This file is not a valid JPG, JPEG or PNG image');
  await assertEditable(req.student);

  const storedName = `${req.student.StudentId}-${crypto.randomBytes(8).toString('hex')}${kind.ext}`;
  const fullPath = path.join(PHOTO_DIR, storedName);
  await fs.promises.writeFile(fullPath, b, { flag: 'wx' });

  let oldName = null;
  try {
    oldName = await ProfileModel.upsertDocument({
      studentId: req.student.StudentId,
      docType: 'PHOTO',
      storedName,
      originalName: String(file.originalname || '').slice(0, 255),
      mimeType: kind.mime,
      sizeBytes: b.length,
    });
  } catch (e) {
    await fs.promises.unlink(fullPath).catch(() => {});
    throw e;
  }
  if (oldName) fs.promises.unlink(path.join(PHOTO_DIR, path.basename(oldName))).catch(() => {});

  res.json(await buildOverview(req.student));
});

exports.getPhoto = h(async (req, res) => {
  const doc = await ProfileModel.getDocument(req.student.StudentId, 'PHOTO');
  if (!doc) throw httpError(404, 'No photo uploaded');
  res.set('Cache-Control', 'private, no-store');
  res.type(doc.MimeType); // image/jpeg or image/png, as detected at upload
  res.sendFile(path.basename(doc.StoredName), { root: PHOTO_DIR }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Photo not found' });
  });
});

// ---------------------------------------------------------------- payment
// TEST MODE: records a payment without a real gateway. Replace the marked block with a
// real gateway (Razorpay etc.) before going live.
exports.pay = async (req, res, next) => {
  let tx;
  try {
    if (process.env.PAYMENT_MODE !== 'test') throw httpError(501, 'Online payment is not enabled yet');
    if (req.body?.declaration !== true) throw httpError(400, 'Please accept the declaration');

    const ov = await buildOverview(req.student);
    if (!ov.application) throw httpError(400, 'Start your application first');
    if (ov.application.status !== 'Draft') throw httpError(409, 'Application already submitted');

    const missing = [];
    if (!ov.steps.personal) missing.push('personal details');
    if (!ov.steps.education) missing.push('education details');
    if (!ov.steps.photo) missing.push('photo');
        if (!ov.steps.documents) missing.push('required documents');


        
    if (missing.length) throw httpError(400, `Complete your ${missing.join(', ')} before payment`);
    if (!(ov.fees.payableNow > 0)) throw httpError(400, 'Fee structure is not configured for your course yet');

    const pool = await getPool();
    tx = new sql.Transaction(pool);
    await tx.begin();

    if (!(await ApplicationModel.markSubmitted(ov.application.applicationId, tx))) {
      throw httpError(409, 'Application already submitted');
    }

    // ---- gateway block (test mode) ----
    await PaymentModel.recordPaid(
      {
        applicationId: ov.application.applicationId,
        amount: ov.fees.payableNow, // always computed on the server
        method: 'TEST',
        transactionRef: `TEST-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      },
      tx
    );
    // ---- end gateway block ----

    await tx.commit();
    tx = null;
    res.json(await buildOverview(req.student));
  } catch (e) {
    if (tx) { try { await tx.rollback(); } catch {} }
    next(e);
  }
};




// ---------------------------------------------------------------- documents
const DOC_SIGNATURES = [
  ...SIGNATURES, // JPEG and PNG
  {
    mime: 'application/pdf',
    ext: '.pdf',
    test: (b) => b.length > 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
];
const DOC_CODE_RX = /^[A-Z0-9_]{2,20}$/;

async function findDocType(code) {
  if (!DOC_CODE_RX.test(code)) throw httpError(404, 'Unknown document type');
  const type = (await DocumentModel.listTypes()).find((t) => t.docType === code);
  if (!type) throw httpError(404, 'Unknown document type');
  return type;
}

exports.uploadDocument = h(async (req, res) => {
  const type = await findDocType(req.params.docType);
  const file = req.file;
  if (!file) throw httpError(400, 'Choose a file to upload');
  const b = file.buffer;

  // real file type from the first bytes (extension and mimetype can be faked)
  const kind = DOC_SIGNATURES.find((k) => k.test(b));
  if (!kind) throw httpError(400, 'This file is not a valid PDF, JPG, JPEG or PNG');
  if (kind.mime === 'application/pdf' && !type.allowPdf) {
    throw httpError(400, `${type.label} must be a JPG, JPEG or PNG image`);
  }
  await assertEditable(req.student);

  const storedName = `${req.student.StudentId}-${type.docType.toLowerCase()}-${crypto.randomBytes(8).toString('hex')}${kind.ext}`;
  const fullPath = path.join(DOC_DIR, storedName);
  await fs.promises.writeFile(fullPath, b, { flag: 'wx' });

  let oldName = null;
  try {
    oldName = await ProfileModel.upsertDocument({
      studentId: req.student.StudentId,
      docType: type.docType,
      storedName,
      originalName: String(file.originalname || '').slice(0, 255),
      mimeType: kind.mime,
      sizeBytes: b.length,
    });
  } catch (e) {
    await fs.promises.unlink(fullPath).catch(() => {});
    throw e;
  }
  if (oldName) fs.promises.unlink(path.join(DOC_DIR, path.basename(oldName))).catch(() => {});

  res.json(await buildOverview(req.student));
});

exports.getDocumentFile = h(async (req, res) => {
  if (!DOC_CODE_RX.test(req.params.docType)) throw httpError(404, 'Document not found');
  const doc = await ProfileModel.getDocument(req.student.StudentId, req.params.docType);
  if (!doc) throw httpError(404, 'Document not found');
  res.set('Cache-Control', 'private, no-store');
  res.type(doc.MimeType);
  res.sendFile(path.basename(doc.StoredName), { root: DOC_DIR }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Document not found' });
  });
});

exports.removeDocument = h(async (req, res) => {
  const type = await findDocType(req.params.docType);
  await assertEditable(req.student);
  const old = await DocumentModel.remove(req.student.StudentId, type.docType);
  if (old) fs.promises.unlink(path.join(DOC_DIR, path.basename(old))).catch(() => {});
  res.json(await buildOverview(req.student));
});