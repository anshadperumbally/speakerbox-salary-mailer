const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/UI KIT', express.static(path.join(__dirname, 'UI KIT')));

const { dataDir, uploadsDir } = require('./config');

// Initialize data files from local data dir if empty (for Vercel)
const initDataFile = (filePath, defaultData) => {
  if (!fs.existsSync(filePath)) {
    const localShippedPath = path.join(__dirname, 'data', path.basename(filePath));
    if (fs.existsSync(localShippedPath)) {
      fs.copyFileSync(localShippedPath, filePath);
    } else {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
  }
};

initDataFile(path.join(dataDir, 'employees.json'), [
  {
    id: "EMP001",
    name: "Rajesh Kumar",
    email: "rajesh.kumar@example.com",
    department: "Engineering",
    position: "Senior Engineer",
    basic: 50000,
    hra: 20000,
    da: 5000,
    conveyance: 3000,
    medical: 1250,
    pf: 6000,
    tds: 5000,
    otherDeductions: 0,
    joiningDate: "2020-01-15"
  },
  {
    id: "EMP002",
    name: "Priya Sharma",
    email: "priya.sharma@example.com",
    department: "HR",
    position: "HR Manager",
    basic: 45000,
    hra: 18000,
    da: 4500,
    conveyance: 3000,
    medical: 1250,
    pf: 5400,
    tds: 4000,
    otherDeductions: 0,
    joiningDate: "2019-06-01"
  },
  {
    id: "EMP003",
    name: "Amit Verma",
    email: "amit.verma@example.com",
    department: "Finance",
    position: "Financial Analyst",
    basic: 42000,
    hra: 16800,
    da: 4200,
    conveyance: 3000,
    medical: 1250,
    pf: 5040,
    tds: 3500,
    otherDeductions: 0,
    joiningDate: "2021-03-10"
  }
]);

initDataFile(path.join(dataDir, 'logs.json'), []);

initDataFile(path.join(dataDir, 'settings.json'), {
  companyName: "My Company Pvt. Ltd.",
  companyAddress: "123 Business Park, Mumbai, India - 400001",
  companyEmail: "hr@mycompany.com",
  smtp: {
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    fromName: "HR Department"
  }
});

// Routes
app.use('/api/employees', require('./routes/employees'));
app.use('/api/mail', require('./routes/mail'));
app.use('/api/settings', require('./routes/settings'));

// Serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (process.env.VERCEL === '1') {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Salary Slip Mailer running at http://localhost:${PORT}`);
    console.log(`📂 Data stored in: ${dataDir}`);
    console.log(`\nPress Ctrl+C to stop the server\n`);
  });
}
 
