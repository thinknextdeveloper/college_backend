const { sql, getPool } = require('../config/db');

// Use a transaction request when a transaction is passed, otherwise a normal pool request
async function request(tx) {
  return tx ? new sql.Request(tx) : (await getPool()).request();
}

module.exports = { sql, getPool, request };