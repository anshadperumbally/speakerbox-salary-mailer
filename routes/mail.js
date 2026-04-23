const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { sendSalarySlip, generatePDF } = require('../services/emailService');
const { dataDir } = require('../config');

const EMPLOYEES_FILE = path.join(dataDir, 'employees.json');
const LOGS_FILE = path.join(dataDir, 'logs.json');

const readEmployees = () => JSON.parse(fs.readFileSync(EMPLOYEES_FILE, 'utf8') || '[]');
const readLogs = () => {
  if (!fs.existsSync(LOGS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8') || '[]');
};
const writeLogs = (logs) => fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));

// POST send bulk emails (Accepts full employee objects)
router.post('/send', async (req, res) => {
  const { employees, month, year, subject, bodyTemplate } = req.body;

  if (!employees || !Array.isArray(employees) || employees.length === 0) {
    return res.status(400).json({ error: 'No employees provided' });
  }

  const results = [];
  const batchId = Date.now().toString();

  for (const emp of employees) {
    try {
      await sendSalarySlip(emp, month, year, subject, bodyTemplate);
      results.push({ id: emp.id, name: emp.name, email: emp.email, status: 'sent' });
    } catch (err) {
      results.push({ id: emp.id, name: emp.name, email: emp.email, status: 'failed', error: err.message });
    }
  }

  // Log results (Optional: can be disabled if user wants NO data)
  const logs = readLogs();
  logs.unshift({
    batchId,
    timestamp: new Date().toISOString(),
    month,
    year,
    total: results.length,
    sent: results.filter(r => r.status === 'sent').length,
    failed: results.filter(r => r.status === 'failed').length,
    results
  });
  writeLogs(logs.slice(0, 100));

  res.json({ success: true, batchId, results });
});

// GET email logs
router.get('/logs', (req, res) => {
  res.json(readLogs());
});

// POST preview PDF (Accepts full employee object)
router.post('/preview', async (req, res) => {
  const { employee, month, year } = req.body;
  if (!employee) return res.status(400).json({ error: 'Employee data required' });
  try {
    const pdfBuffer = await generatePDF(employee, month, year);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="salary_slip_${employee.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
