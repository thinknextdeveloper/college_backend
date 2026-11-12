const sql = require('mssql/msnodesqlv8');

const driver = process.env.DB_DRIVER || 'ODBC Driver 18 for SQL Server';

const config = {
  connectionString:
    `Driver={${driver}};Server=${process.env.DB_SERVER};` +
    `Database=${process.env.DB_NAME};Trusted_Connection=Yes;` +
    `Encrypt=No;TrustServerCertificate=Yes;`,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

let pool;
async function getPool() {
  if (!pool) pool = await new sql.ConnectionPool(config).connect();
  return pool;
}

module.exports = { sql, getPool };