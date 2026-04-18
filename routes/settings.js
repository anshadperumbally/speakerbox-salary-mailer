const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');

const readSettings = () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
const writeSettings = (data) => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));

// GET settings
router.get('/', (req, res) => {
  const settings = readSettings();
  // Mask password
  const safe = JSON.parse(JSON.stringify(settings));
  if (safe.smtp && safe.smtp.pass) safe.smtp.pass = '••••••••';
  res.json(safe);
});

// PUT update settings
router.put('/', (req, res) => {
  const current = readSettings();
  const updated = {
    ...current,
    companyName: req.body.companyName || current.companyName,
    companyAddress: req.body.companyAddress || current.companyAddress,
    companyEmail: req.body.companyEmail || current.companyEmail,
    smtp: {
      host: req.body.smtp?.host || current.smtp.host,
      port: parseInt(req.body.smtp?.port) || current.smtp.port,
      secure: req.body.smtp?.secure !== undefined ? req.body.smtp.secure : current.smtp.secure,
      user: req.body.smtp?.user || current.smtp.user,
      pass: req.body.smtp?.pass && req.body.smtp.pass !== '••••••••' ? req.body.smtp.pass : current.smtp.pass,
      fromName: req.body.smtp?.fromName || current.smtp.fromName
    }
  };
  writeSettings(updated);
  res.json({ success: true });
});

// POST test SMTP connection
router.post('/test', async (req, res) => {
  const settings = readSettings();
  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtp.host,
      port: settings.smtp.port,
      secure: settings.smtp.secure,
      auth: { user: settings.smtp.user, pass: settings.smtp.pass }
    });
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection successful!' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
