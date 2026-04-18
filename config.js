const path = require('path');
const os = require('os');
const fs = require('fs');

const isVercel = process.env.VERCEL === '1';
const dataDir = isVercel ? path.join(os.tmpdir(), 'data') : path.join(__dirname, 'data');
const uploadsDir = isVercel ? path.join(os.tmpdir(), 'uploads') : path.join(__dirname, 'uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

module.exports = { dataDir, uploadsDir };
