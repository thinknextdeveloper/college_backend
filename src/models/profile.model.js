const { sql, getPool, request } = require('./base');

// ---------- personal ----------
exports.getPersonal = async (studentId) => {
  const r = await (await request()).input('s', sql.Int, studentId).query(
    `SELECT FirstName AS firstName, MiddleName AS middleName, LastName AS lastName,
            CONVERT(VARCHAR(10), DateOfBirth, 23) AS dateOfBirth,
            Gender AS gender, Category AS category, Religion AS religion, Nationality AS nationality,
            AadhaarNo AS aadhaar, FatherName AS fatherName, FatherMobile AS fatherMobile,
            MotherName AS motherName, AddressLine AS addressLine, City AS city, State AS state,
            Pincode AS pincode, IsPermanentSame AS isPermanentSame, PermanentAddress AS permanentAddress
     FROM StudentPersonalDetails WHERE StudentId = @s`
  );
  return r.recordset[0];
};

exports.upsertPersonal = async (studentId, d) => {
  await (await request())
    .input('s', sql.Int, studentId)
    .input('fn', sql.NVarChar, d.firstName)
    .input('mn', sql.NVarChar, d.middleName || null)
    .input('ln', sql.NVarChar, d.lastName || null)
    .input('dob', sql.VarChar, d.dateOfBirth)
    .input('g', sql.VarChar, d.gender)
    .input('c', sql.VarChar, d.category)
    .input('rl', sql.NVarChar, d.religion || null)
    .input('nt', sql.NVarChar, d.nationality)
    .input('ad', sql.Char(12), d.aadhaar || null)
    .input('fa', sql.NVarChar, d.fatherName)
    .input('fm', sql.VarChar, d.fatherMobile)
    .input('mo', sql.NVarChar, d.motherName)
    .input('al', sql.NVarChar, d.addressLine)
    .input('ci', sql.NVarChar, d.city)
    .input('st', sql.NVarChar, d.state)
    .input('pc', sql.Char(6), d.pincode)
    .input('same', sql.Bit, d.isPermanentSame)
    .input('pa', sql.NVarChar, d.isPermanentSame ? null : d.permanentAddress)
    .query(`IF EXISTS (SELECT 1 FROM StudentPersonalDetails WHERE StudentId = @s)
              UPDATE StudentPersonalDetails SET
                FirstName=@fn, MiddleName=@mn, LastName=@ln, DateOfBirth=CAST(@dob AS DATE),
                Gender=@g, Category=@c, Religion=@rl, Nationality=@nt, AadhaarNo=@ad,
                FatherName=@fa, FatherMobile=@fm, MotherName=@mo, AddressLine=@al, City=@ci,
                State=@st, Pincode=@pc, IsPermanentSame=@same, PermanentAddress=@pa,
                UpdatedAt=SYSUTCDATETIME()
              WHERE StudentId = @s
            ELSE
              INSERT INTO StudentPersonalDetails
                (StudentId, FirstName, MiddleName, LastName, DateOfBirth, Gender, Category, Religion,
                 Nationality, AadhaarNo, FatherName, FatherMobile, MotherName, AddressLine, City, State,
                 Pincode, IsPermanentSame, PermanentAddress)
              VALUES
                (@s, @fn, @mn, @ln, CAST(@dob AS DATE), @g, @c, @rl, @nt, @ad, @fa, @fm, @mo, @al, @ci,
                 @st, @pc, @same, @pa)`);
};

// ---------- education (10th, 12th, diploma) ----------
exports.listEducation = async (studentId) => {
  const r = await (await request()).input('s', sql.Int, studentId).query(
    `SELECT EduLevel AS level, BoardOrUniversity AS board, Institute AS institute,
            StreamOrBranch AS stream, RollNo AS rollNo, PassingYear AS passingYear, Percentage AS percentage
     FROM StudentEducation WHERE StudentId = @s`
  );
  return r.recordset;
};

async function upsertEdu(studentId, level, d, tx) {
  await (await request(tx))
    .input('s', sql.Int, studentId)
    .input('l', sql.VarChar, level)
    .input('b', sql.NVarChar, d.board)
    .input('i', sql.NVarChar, d.institute)
    .input('st', sql.NVarChar, d.stream || null)
    .input('r', sql.NVarChar, d.rollNo || null)
    .input('y', sql.SmallInt, d.passingYear)
    .input('p', sql.Decimal(5, 2), d.percentage)
    .query(`IF EXISTS (SELECT 1 FROM StudentEducation WHERE StudentId=@s AND EduLevel=@l)
              UPDATE StudentEducation SET BoardOrUniversity=@b, Institute=@i, StreamOrBranch=@st,
                RollNo=@r, PassingYear=@y, Percentage=@p, UpdatedAt=SYSUTCDATETIME()
              WHERE StudentId=@s AND EduLevel=@l
            ELSE
              INSERT INTO StudentEducation
                (StudentId, EduLevel, BoardOrUniversity, Institute, StreamOrBranch, RollNo, PassingYear, Percentage)
              VALUES (@s, @l, @b, @i, @st, @r, @y, @p)`);
}

exports.saveEducation = async (studentId, { tenth, twelfth, diploma }) => {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await upsertEdu(studentId, '10TH', tenth, tx);
    await upsertEdu(studentId, '12TH', twelfth, tx);
    if (diploma) {
      await upsertEdu(studentId, 'DIPLOMA', diploma, tx);
    } else {
      await (await request(tx)).input('s', sql.Int, studentId)
        .query(`DELETE FROM StudentEducation WHERE StudentId = @s AND EduLevel = 'DIPLOMA'`);
    }
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
};

// ---------- documents (photo) ----------
exports.getDocument = async (studentId, docType) => {
  const r = await (await request())
    .input('s', sql.Int, studentId)
    .input('t', sql.VarChar, docType)
    .query(`SELECT StoredName, OriginalName, MimeType, SizeBytes, UploadedAt
            FROM StudentDocuments WHERE StudentId = @s AND DocType = @t`);
  return r.recordset[0];
};

// Returns the previous stored filename (so the caller can delete the old file)
exports.upsertDocument = async ({ studentId, docType, storedName, originalName, mimeType, sizeBytes }) => {
  const bind = (req) =>
    req
      .input('s', sql.Int, studentId)
      .input('t', sql.VarChar, docType)
      .input('n', sql.VarChar, storedName)
      .input('o', sql.NVarChar, originalName)
      .input('m', sql.VarChar, mimeType)
      .input('z', sql.Int, sizeBytes);

  const upd = await bind(await request()).query(
    `UPDATE StudentDocuments
     SET StoredName=@n, OriginalName=@o, MimeType=@m, SizeBytes=@z, UploadedAt=SYSUTCDATETIME()
     OUTPUT DELETED.StoredName AS oldName
     WHERE StudentId=@s AND DocType=@t`
  );
  if (upd.recordset && upd.recordset.length) return upd.recordset[0].oldName;

  await bind(await request()).query(
    `INSERT INTO StudentDocuments (StudentId, DocType, StoredName, OriginalName, MimeType, SizeBytes)
     VALUES (@s, @t, @n, @o, @m, @z)`
  );
  return null;
};