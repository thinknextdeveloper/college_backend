require('dotenv').config();
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { getPool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler.js');
const { ensureTestStudent } = require('./controllers/auth.controller');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/lookup', require('./routes/lookup.routes'));

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use(errorHandler);

const port = process.env.PORT || 5000;
getPool()
  .then(async (pool) => {
    app.listen(port, () => console.log(`API running on http://localhost:${port}`));
    try {
      await ensureTestStudent(pool);
    } catch (e) {
      console.warn('Auto-seed check note:', e.message);
    }
  })
  .catch((e) => {
    console.error('Database connection failed:', e.message);
    process.exit(1);
  });
