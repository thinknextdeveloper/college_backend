const { sql, request } = require('./base');

exports.listTypes = async () => {
  const r = await (await request()).query(
    `SELECT DocType AS docType, Label AS label, RequiredWhen AS requiredWhen, AllowPdf AS allowPdf
     FROM DocumentTypes WHERE IsActive = 1 ORDER BY SortOrder, DocType`
  );
  return r.recordset;
};

// Everything the student uploaded except the passport photo (that has its own step)
exports.listForStudent = async (studentId) => {
  const r = await (await request()).input('s', sql.Int, studentId).query(
    `SELECT DocType AS docType, OriginalName AS originalName, MimeType AS mimeType,
            SizeBytes AS sizeBytes, UploadedAt AS uploadedAt
     FROM StudentDocuments WHERE StudentId = @s AND DocType <> 'PHOTO'`
  );
  return r.recordset;
};

// Returns the stored filename so the caller can delete the file from disk
exports.remove = async (studentId, docType) => {
  const r = await (await request())
    .input('s', sql.Int, studentId)
    .input('t', sql.VarChar, docType)
    .query(`DELETE FROM StudentDocuments
            OUTPUT DELETED.StoredName AS storedName
            WHERE StudentId = @s AND DocType = @t`);
  return r.recordset.length ? r.recordset[0].storedName : null;
};