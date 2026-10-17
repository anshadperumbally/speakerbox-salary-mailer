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

// Helper: map CSV row → internal employee object
const csvRowToEmployee = (row, index, existingCount) => {
  const idValue = getVal(row, 'Employee No', 'Employee ID', 'Id', 'id', 'ID', 'Emp ID', 'Emp No');
  const id = String(idValue || `EMP${String(existingCount + index + 1).padStart(3, '0')}`).trim();

  const basic = parseAmount(getVal(row, 'Basic Pay', 'Basic', 'basic', 'Basic Salary'));
  const rawEarned = parseAmount(getVal(row, 'Earned Salary', 'Earned', 'earned', 'Earned Basic'));
  const ot = parseAmount(getVal(row, 'OT', 'ot', 'Overtime', 'Over Time'));
  const bonus = parseAmount(getVal(row, 'Bonus', 'bonus'));
  const stipend = parseAmount(getVal(row, 'Stipend', 'stipend'));
  const ta = parseAmount(getVal(row, 'TA', 'ta', 'Travel Allowance'));

  let baseEarned = rawEarned > 0 ? rawEarned : basic;
  if (rawEarned > 0 && (ot > 0 || bonus > 0 || stipend > 0 || ta > 0)) {
    if (Math.abs(rawEarned - (basic + ot + bonus + stipend + ta)) < 0.01) {
      baseEarned = basic;
    }
  }
  const earned = baseEarned + ot + bonus + stipend + ta;

  // Deductions ONLY include Attendance Cuts, Leave Cut, Advance Salary
  const attendanceCuts = parseAmount(getVal(row, 'Attendance Cuts', 'Attendance Cut', 'attendance cuts', 'Attendance'));
  const leaveCut = parseAmount(getVal(row, 'Leave Cut', 'Leave Cuts', 'leave cut', 'Leave'));
  const advance = parseAmount(getVal(row, 'Advance Salary', 'Advance', 'advance', 'Advance Pay'));
  const totalDeductions = attendanceCuts + leaveCut + advance;

  // Gross Salary = Total earned - Total deduction
  const gross = Math.max(0, earned - totalDeductions);
  const net = gross;

  return {
    email:             (getVal(row, 'Email', 'email', 'E-mail', 'Email ID') || '').trim(),
    id,
    name:              (getVal(row, 'Name', 'name', 'Employee Name') || '').trim(),
    position:          (getVal(row, 'Designation', 'Position', 'position', 'Role') || '').trim(),
    location:          (getVal(row, 'Location', 'location', 'City', 'Branch') || '').trim(),
    // Attendance
    balanceLeaves:     parseNum(getVal(row, 'Balance Leaves', 'Leave Balance', 'Leaves', 'leaves')),
    restrictedHoliday: parseNum(getVal(row, 'worked on Resticted holiday', 'worked on Restricted holiday', 'Restricted Holiday', 'Restricted Holidays')),
    presentDays:       parseNum(getVal(row, 'Present Days', 'Present', 'present')),
    paidLeave:         parseNum(getVal(row, 'Paid Leave', 'Paid Leaves')),
    paidDays:          parseNum(getVal(row, 'Paid Days', 'Paid days', 'Workingdays', 'Working Days')),
    leaveBalance:      parseNum(getVal(row, 'Leave Balance', 'Balance Leaves', 'Leaves')),
    comments:          (getVal(row, 'Comments', 'Comment', 'comments') || '').trim(),
    
    // Earnings
    basic,
    earned, 
    ot,
    bonus,
    stipend,
    ta,
    gross,
    
    // Deductions
    attendanceCuts,
    leaveCut,
    advance,
    unpaid:            0,
    underworked:       0,
    liability:         0,
    totalDeductions,
    
    net,
    
    // Standard implicit
    department:        (getVal(row, 'Department', 'department', 'Dept') || '').trim(),
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
  const ot = parseAmount(req.body.ot);
  const bonus = parseAmount(req.body.bonus);
  const stipend = parseAmount(req.body.stipend);
  const ta = parseAmount(req.body.ta);
  let baseEarned = rawEarned > 0 ? rawEarned : basic;
  if (rawEarned > 0 && (ot > 0 || bonus > 0 || stipend > 0 || ta > 0)) {
    if (Math.abs(rawEarned - (basic + ot + bonus + stipend + ta)) < 0.01) {
      baseEarned = basic;
    }
  }
  const earned = baseEarned + ot + bonus + stipend + ta;

  // Deductions ONLY include Attendance Cuts, Leave Cut, Advance Salary
  const attendanceCuts = parseAmount(req.body.attendanceCuts);
  const leaveCut = parseAmount(req.body.leaveCut);
  const advance = parseAmount(req.body.advance);
  const totalDeductions = attendanceCuts + leaveCut + advance;

  // Gross Salary = Total earned - Total deduction
  const gross = Math.max(0, earned - totalDeductions);
  const net = gross;

  const emp = {
    id:          req.body.id || `EMP${String(employees.length + 1).padStart(3, '0')}`,
    name:        req.body.name        || '',
    email:       req.body.email       || '',
    department:  req.body.department  || '',
    position:    req.body.position    || '',
    joiningDate: req.body.joiningDate || '',
    month:       req.body.month       || '',
    year:        req.body.year        || '',
    workingDays: parseFloat(req.body.workingDays) || 0,
    presentDays: parseFloat(req.body.presentDays) || 0,
    paidDays:    parseFloat(req.body.paidDays)    || 0,
    unpaidDays:  parseFloat(req.body.unpaidDays)  || 0,
    leaves:      parseFloat(req.body.leaves)      || 0,
    wfm:         parseFloat(req.body.wfm)         || 0,
    comments:    req.body.comments    || '',
    basic,
    ot,
    bonus,
    stipend,
    ta,
    earned,
    gross,
    advance,
    attendanceCuts,
    leaveCut,
    unpaid,
    underworked,
    liability,
    deduction: totalDeductions,
    totalDeductions,
    net,
    via:         req.body.via || 'Bank',
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

// POST import CSV (No persistence)
router.post('/import', upload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const newEmps = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
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

// GET sample CSV template
router.get('/sample-csv', (req, res) => {
  const headers = 'Email,Employee No,Name,Designation,Location,Balance Leaves,Basic Pay,worked on Resticted holiday,Present Days,Paid Leave,Paid Days,Earned Salary,OT,Bonus,Gross Salary,Attendance Cuts,Leave Cut,Advance Salary,Total,Net Salary,Leave Balance,Comments';
  const sample  = 'john@company.com,EMP001,John Doe,Software Engineer,New York,5,50000,0,22,2,24,50000,1000,5000,56000,0,0,0,0,56000,5,Great work';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_salary_template.csv"');
  res.send(`${headers}\n${sample}`);
});

module.exports = router;
