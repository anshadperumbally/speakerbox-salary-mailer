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

// Helper: strip ₹/₹/? symbols + commas and parse float
const parseAmount = (val) => {
  if (!val) return 0;
  const cleaned = String(val).replace(/[₹?,\s]/g, '').trim();
  return parseFloat(cleaned) || 0;
};

// Helper: map CSV row → internal employee object
const csvRowToEmployee = (row, index, existingCount) => {
  const idValue = row['Employee No'] || row['Id'] || row['id'] || row['ID'];
  const id = String(idValue || `EMP${String(existingCount + index + 1).padStart(3, '0')}`).trim();

  const basic = parseAmount(row['Basic'] || row['Basic Pay']);
  const earnedBasic = parseAmount(row['earned'] || row['Earned Salary']) || basic;
  const ot = parseAmount(row['OT']);
  const bonus = parseAmount(row['Bonus']);
  const stipend = parseAmount(row['Stipend'] || row['stipend']);
  const ta = parseAmount(row['TA'] || row['ta']);

  const attendanceCuts = parseAmount(row['Attendance Cuts']);
  const leaveCut = parseAmount(row['Leave Cut']);
  const advance = parseAmount(row['Advance'] || row['Advance Salary']);
  const unpaid = parseAmount(row['unpaid'] || row['Unpaid']);
  const underworked = parseAmount(row['underworked'] || row['Underworked']);
  const liability = parseAmount(row['liability'] || row['Liability']);

  const calculatedDeductions = attendanceCuts + leaveCut + advance + unpaid + underworked + liability;
  const totalDeductions = parseAmount(row['Total'] || row['deduction']) || calculatedDeductions;

  const calculatedGross = earnedBasic + ot + bonus + stipend + ta;
  const rawGross = parseAmount(row['gross'] || row['Gross Salary']);
  const gross = rawGross > 0 ? Math.max(rawGross, calculatedGross) : calculatedGross;

  const calculatedNet = gross - totalDeductions;
  const rawNet = parseAmount(row['Net Salary'] || row['Net'] || row['net']);
  const net = (rawNet > 0 && Math.abs(rawNet - calculatedNet) < 0.01) ? rawNet : calculatedNet;

  return {
    email:             (row['Email'] || '').trim(),
    id,
    name:              (row['Name'] || '').trim(),
    position:          (row['Designation'] || '').trim(),
    location:          (row['Location'] || '').trim(),
    // Attendance
    balanceLeaves:     parseFloat(row['Balance Leaves'] || 0),
    restrictedHoliday: parseFloat(row['worked on Resticted holiday'] || 0),
    presentDays:       parseFloat(row['Present Days'] || 0),
    paidLeave:         parseFloat(row['Paid Leave'] || 0),
    paidDays:          parseFloat(row['Paid Days'] || 0),
    leaveBalance:      parseFloat(row['Leave Balance'] || 0),
    comments:          (row['Comments'] || '').trim(),
    
    // Earnings
    basic,
    earned:            earnedBasic, 
    ot,
    bonus,
    stipend,
    ta,
    gross,
    
    // Deductions
    attendanceCuts,
    leaveCut,
    advance,
    unpaid,
    underworked,
    liability,
    totalDeductions,
    
    net,
    
    // Standard implicit
    department:        (row['Department'] || '').trim(),
    month:             (row['Month'] || '').trim(),
    year:              (row['Year'] || '').trim(),
    via:               (row['via'] || 'Bank').trim()
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
  const earned = parseAmount(req.body.earned) || basic;
  const ot = parseAmount(req.body.ot);
  const bonus = parseAmount(req.body.bonus);
  const stipend = parseAmount(req.body.stipend);
  const ta = parseAmount(req.body.ta);
  const calculatedGross = earned + ot + bonus + stipend + ta;
  const gross = parseAmount(req.body.gross) || calculatedGross;

  const attendanceCuts = parseAmount(req.body.attendanceCuts);
  const leaveCut = parseAmount(req.body.leaveCut);
  const advance = parseAmount(req.body.advance);
  const unpaid = parseAmount(req.body.unpaid);
  const underworked = parseAmount(req.body.underworked);
  const liability = parseAmount(req.body.liability);
  const calculatedDeductions = attendanceCuts + leaveCut + advance + unpaid + underworked + liability;
  const deduction = parseAmount(req.body.deduction || req.body.totalDeductions) || calculatedDeductions;

  const net = parseAmount(req.body.net) || (gross - deduction);

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
    deduction,
    totalDeductions: deduction,
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
      if (!row['Name'] && !row['name']) return;
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
