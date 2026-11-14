require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { getPool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler.js');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/authroutes.js'));
app.use('/api/lookup', require('./routes/lookuproutes.js'));
app.use('/api/student', require('./routes/student.routes'));
app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use(errorHandler);

const port = process.env.PORT ||3000|| 5000;
getPool()
  .then(() => app.listen(port, () => console.log(`API running on http://localhost:${port}`)))
  .catch((e) => { console.error('Database connection failed:', e.message); process.exit(1); });