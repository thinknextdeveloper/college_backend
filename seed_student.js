require('dotenv').config();
const { sql, getPool } = require('./src/config/db');
const { ensureTestStudent } = require('./src/controllers/auth.controller');

async function run() {
  console.log('Connecting to database:', process.env.DB_NAME);
  try {
    const pool = await getPool();
    console.log('Connected! Creating/Verifying test student...');
    const result = await ensureTestStudent(pool);
    console.log('\n--- TEST STUDENT READY ---');
    console.log('Mobile / User Name:', result.credentials.username);
    console.log('Password:         ', result.credentials.password);
    console.log('Email:            ', result.credentials.email);
    console.log('Status:           ', result.status);
    console.log('--------------------------\n');
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed student:', err.message);
    process.exit(1);
  }
}

run();

