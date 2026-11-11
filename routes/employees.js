const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const csv = require('csv-parser');
const { dataDir, uploadsDir } = require('../config');

const DATA_FILE = path.join(dataDir, 'employees.json');
const upload = multer({ dest: uploadsDir });

const readEmployees = () => {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
};
const writeEmployees = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// Helper: flexible key finder in CSV row (case-insensitive, whitespace-trimmed)
const getVal = (row, ...keys) => {
  if (!row || typeof row !== 'object') return undefined;
  const rowKeys = Object.keys(row);
  for (const key of keys) {
    const target = key.toLowerCase().replace(/[\s_-]+/g, '');
    for (const rk of rowKeys) {
      const cleanRk = rk.trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (cleanRk === target) {
        return row[rk];
      }
    }
  }
  return undefined;
};

// Helper: strip ₹/Rs/INR/? symbols + commas + /- and parse float
const parseAmount = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val)
    .replace(/(?:Rs\.?|INR|₹|\?|\/-)/gi, '')
    .replace(/,/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

const parseNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

// Helper: detect delimiter (\t, ,, ;) from file sample
const detectDelimiter = (filePath) => {
  try {
    const buf = Buffer.alloc(4096);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    let sample = buf.toString('utf8', 0, bytesRead);
    if (sample.charCodeAt(0) === 0xFEFF) sample = sample.slice(1);
    const firstLine = sample.split(/\r?\n/)[0] || '';
    const tabs = (firstLine.match(/\t/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const semis = (firstLine.match(/;/g) || []).length;
    if (tabs > commas && tabs > semis) return '\t';
    if (semis > commas && semis > tabs) return ';';
    return ',';
  } catch {
    return ',';
  }
};

// Helper: map CSV/TSV row → internal employee object
const csvRowToEmployee = (row, index, existingCount) => {
  const idValue = getVal(row, 'Employee No', 'Employee ID', 'Emp No', 'Id', 'id', 'ID', 'Emp ID');
  const id = String(idValue || `EMP${String(existingCount + index + 1).padStart(3, '0')}`).trim();

  const name = (getVal(row, 'Name', 'name', 'Employee Name') || '').trim();
  const position = (getVal(row, 'Designation', 'DESIGNATION', 'Position', 'position', 'Role') || '').trim();
  const location = (getVal(row, 'Location', 'LOCATION', 'City', 'Branch') || '').trim();

  const basic = parseAmount(getVal(row, 'Basic Pay', 'BASIC PAY', 'Basic', 'basic', 'Basic Salary'));
  const rawEarned = parseAmount(getVal(row, 'Earned Salary', 'EARNED SALARY', 'Earned', 'earned', 'Earned Basic'));
  const earned = rawEarned > 0 ? rawEarned : basic;

  const ot = parseAmount(getVal(row, 'OT', 'ot', 'Overtime', 'Over Time'));
  const payout = parseAmount(getVal(row, 'Pay Out', 'PAY OUT', 'Payout', 'payout', 'Bonus', 'bonus', 'Allowance'));

  // Gross Salary = Earned Salary + OT + Pay Out
  const calculatedGross = earned + ot + payout;
  const rawGross = parseAmount(getVal(row, 'Gross Salary', 'GROSS SALARY', 'Gross Pay', 'Gross', 'gross'));
  const gross = rawGross > 0 ? rawGross : calculatedGross;

  // Deductions: Attendance Cuts + LWOP + Advance Salary
  const attendanceCuts = parseAmount(getVal(row, 'Attendance Cuts', 'ATTENDANCE CUTS', 'Attendance Cut', 'attendance cuts', 'Attendance'));
  const lwop = parseAmount(getVal(row, 'LWOP', 'lwop', 'Leave Without Pay', 'Leave Cut', 'Leave Cuts', 'leave cut'));
  const advance = parseAmount(getVal(row, 'Advance Salary', 'ADVANCE SALARY', 'Advance', 'advance', 'Advance Pay'));
  const calculatedDeductions = attendanceCuts + lwop + advance;
  const rawTotal = parseAmount(getVal(row, 'Total', 'TOTAL', 'Total Deduction', 'Total Deductions', 'Deduction', 'deductions'));
  const totalDeductions = rawTotal > 0 ? rawTotal : calculatedDeductions;

  // Net Salary = Gross Salary - Total Deductions
  const calculatedNet = Math.max(0, gross - totalDeductions);
  const rawNet = parseAmount(getVal(row, 'Net Salary', 'NET SALARY', 'Net Pay', 'Net', 'net', 'Net Amount'));
  const net = rawNet > 0 ? rawNet : calculatedNet;

  // Attendance fields
  const balanceLeaves = parseNum(getVal(row, 'Balance Leaves', 'BALANCE LEAVES', 'Opening Balance Leaves'));
  const rh = parseNum(getVal(row, 'RH', 'rh', 'Restricted Holiday', 'Restricted Holidays', 'worked on Resticted holiday', 'worked on Restricted holiday'));
  const presentDays = parseNum(getVal(row, 'Present Days', 'PRESENT DAYS', 'Present', 'present'));
  const paidLeave = parseNum(getVal(row, 'Paid Leave', 'PAID LEAVE', 'Paid Leaves'));
  const paidDays = parseNum(getVal(row, 'Paid Days', 'PAID DAYS', 'Paid days', 'Workingdays', 'Working Days'));

  const rawClosing = parseNum(getVal(row, 'Leave Balance', 'Closing Leave Balance', 'Remaining Leaves'));
  const leaveBalance = (rawClosing !== undefined && rawClosing !== 0) 
    ? rawClosing 
    : (balanceLeaves !== undefined ? Math.max(0, balanceLeaves - paidLeave) : 0);

  const comments = (getVal(row, 'comments', 'Comments', 'Comment', 'Employee Comments', 'Remarks') || '').trim();

  return {
    id,
    name,
    email:             (getVal(row, 'Email', 'email', 'E-mail', 'Email ID') || '').trim(),
    position,
    designation:       position,
    location,
    department:        (getVal(row, 'Department', 'department', 'Dept') || '').trim(),
    
    // Attendance
    balanceLeaves,
    rh,
    restrictedHoliday: rh,
    presentDays,
    paidLeave,
    paidDays,
    leaveBalance,
    comments,
    
    // Earnings
    basic,
    earned,
    ot,
    payout,
    bonus:             payout,
    gross,
    
    // Deductions
    attendanceCuts,
    lwop,
    leaveCut:          lwop,
    advance,
    totalDeductions,
    total:             totalDeductions,
    deduction:         totalDeductions,
    unpaid:            0,
    underworked:       0,
    liability:         0,
    
    // Net
    net,
    
    month:             (getVal(row, 'Month', 'month') || '').trim(),
    year:              (getVal(row, 'Year', 'year') || '').trim(),
    via:               (getVal(row, 'via', 'Via', 'Paid Via', 'Payment Mode') || 'Bank').trim()
  };
};

// GET all employees
router.get('/', (req, res) => {
  res.json(readEmployees());
});

// POST add employee
router.post('/', (req, res) => {
  const employees = readEmployees();
  const basic = parseAmount(req.body.basic);
  const rawEarned = parseAmount(req.body.earned);
  const earned = rawEarned > 0 ? rawEarned : basic;

  const ot = parseAmount(req.body.ot);
  const payout = parseAmount(req.body.payout || req.body.bonus);
  const gross = parseAmount(req.body.gross) || (earned + ot + payout);

  const attendanceCuts = parseAmount(req.body.attendanceCuts);
  const lwop = parseAmount(req.body.lwop || req.body.leaveCut);
  const advance = parseAmount(req.body.advance);
  const totalDeductions = parseAmount(req.body.totalDeductions || req.body.total) || (attendanceCuts + lwop + advance);

  const net = parseAmount(req.body.net) || Math.max(0, gross - totalDeductions);

  const balanceLeaves = parseFloat(req.body.balanceLeaves) || 0;
  const paidLeave = parseFloat(req.body.paidLeave) || 0;
  const leaveBalance = req.body.leaveBalance !== undefined ? parseFloat(req.body.leaveBalance) : Math.max(0, balanceLeaves - paidLeave);

  const emp = {
    id:                req.body.id || `EMP${String(employees.length + 1).padStart(3, '0')}`,
    name:              req.body.name        || '',
    email:             req.body.email       || '',
    department:        req.body.department  || '',
    position:          req.body.position || req.body.designation || '',
    designation:       req.body.designation || req.body.position || '',
    location:          req.body.location    || '',
    joiningDate:       req.body.joiningDate || '',
    month:             req.body.month       || '',
    year:              req.body.year        || '',
    // Attendance
    presentDays:       parseFloat(req.body.presentDays) || 0,
    paidDays:          parseFloat(req.body.paidDays)    || 0,
    paidLeave,
    rh:                parseFloat(req.body.rh || req.body.restrictedHoliday) || 0,
    restrictedHoliday: parseFloat(req.body.restrictedHoliday || req.body.rh) || 0,
    balanceLeaves,
    leaveBalance,
    comments:          req.body.comments    || '',
    // Financials
    basic,
    earned,
    ot,
    payout,
    bonus:             payout,
    gross,
    attendanceCuts,
    lwop,
    leaveCut:          lwop,
    advance,
    totalDeductions,
    total:             totalDeductions,
    deduction:         totalDeductions,
    net,
    via:               req.body.via || 'Bank'
  };
  employees.push(emp);
  writeEmployees(employees);
  res.json({ success: true, employee: emp });
});

// PUT update employee
router.put('/:id', (req, res) => {
  let employees = readEmployees();
  const idx = employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Employee not found' });
  employees[idx] = { ...employees[idx], ...req.body };
  writeEmployees(employees);
  res.json({ success: true, employee: employees[idx] });
});

// DELETE employee
router.delete('/:id', (req, res) => {
  let employees = readEmployees();
  employees = employees.filter(e => e.id !== req.params.id);
  writeEmployees(employees);
  res.json({ success: true });
});

// POST import CSV/TSV file (No persistence)
router.post('/import', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const separator = detectDelimiter(req.file.path);
  const newEmps = [];

  fs.createReadStream(req.file.path)
    .pipe(csv({ separator }))
    .on('data', (row) => {
      const name = getVal(row, 'Name', 'name', 'Employee Name');
      if (!name) return;
      newEmps.push(csvRowToEmployee(row, newEmps.length, 0));
    })
    .on('end', () => {
      try { fs.unlinkSync(req.file.path); } catch {}
      res.json({ success: true, employees: newEmps });
    })
    .on('error', (err) => {
      res.status(500).json({ error: err.message });
    });
});

// POST import text/clipboard (Direct paste from Google Sheets / Excel)
router.post('/import-text', (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'No text provided' });
  
  let cleanText = text.trim();
  if (cleanText.charCodeAt(0) === 0xFEFF) cleanText = cleanText.slice(1);
  const lines = cleanText.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return res.status(400).json({ error: 'Empty content' });

  const firstLine = lines[0];
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const sep = (tabs >= commas && tabs >= semis) ? '\t' : (semis > commas ? ';' : ',');

  const headers = lines[0].split(sep).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const newEmps = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length === 0 || cols.every(c => !c)) continue;
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] !== undefined ? cols[idx] : '';
    });
    const name = getVal(row, 'Name', 'name', 'Employee Name');
    if (!name) continue;
    newEmps.push(csvRowToEmployee(row, newEmps.length, 0));
  }

  res.json({ success: true, employees: newEmps });
});

// GET sample CSV template
router.get('/sample-csv', (req, res) => {
  const headers = 'Employee No,Name,DESIGNATION,LOCATION,BALANCE LEAVES,BASIC PAY,RH,PRESENT DAYS,PAID LEAVE,PAID DAYS,EARNED SALARY,OT,PAY OUT,GROSS SALARY,ATTENDANCE CUTS,LWOP,ADVANCE SALARY,TOTAL,NET SALARY,Leave Balance,comments,Email';
  const sample  = '54,Anshad P,Accountant,Calicut,2,19000,1,22,1,24,19000,500,0,19500,200,300,1000,1500,18000,1,Nil,anshadperumbally@gmail.com';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="speakerbox_salary_template.csv"');
  res.send(`${headers}\n${sample}`);
});

module.exports = router;
