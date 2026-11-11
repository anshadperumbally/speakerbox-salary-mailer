const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { dataDir } = require('../config');

const SETTINGS_FILE = path.join(dataDir, 'settings.json');
const readSettings = () => JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));

// ─── Currency formatter ───────────────────────────────────────────
const fmt = (n) => {
  const num = parseFloat(n || 0);
  return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtNum = (n) => {
  const num = parseFloat(n || 0);
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─── Calculate derived fields ─────────────────────────────────────
const calcPayroll = (emp) => {
  const basic = parseFloat(emp.basic || 0);
  const rawEarned = parseFloat(emp.earned || 0);
  const earned = rawEarned > 0 ? rawEarned : basic;

  const ot = parseFloat(emp.ot || 0);
  const payout = parseFloat(emp.payout || emp.bonus || emp.stipend || emp.ta || 0);

  // Gross Salary = Earned Salary + OT + Pay Out
  const rawGross = parseFloat(emp.gross || 0);
  const calculatedGross = earned + ot + payout;
  const gross = rawGross > 0 ? rawGross : calculatedGross;

  // Deductions: Attendance Cuts + LWOP + Advance Salary
  const attendanceCuts = parseFloat(emp.attendanceCuts || 0);
  const lwop = parseFloat(emp.lwop || emp.leaveCut || 0);
  const advance = parseFloat(emp.advance || 0);
  const calculatedDeductions = attendanceCuts + lwop + advance;
  const rawTotal = parseFloat(emp.totalDeductions || emp.total || emp.deduction || 0);
  const totalDeductions = rawTotal > 0 ? rawTotal : calculatedDeductions;

  // Net Salary = Gross Salary - Total Deductions
  const rawNet = parseFloat(emp.net || 0);
  const calculatedNet = Math.max(0, gross - totalDeductions);
  const net = rawNet > 0 ? rawNet : calculatedNet;

  return { basic, earned, ot, payout, gross, attendanceCuts, lwop, advance, totalDeductions, net };
};

// ─── Nodemailer transporter ───────────────────────────────────────
const getTransporter = () => {
  const s = readSettings();
  return nodemailer.createTransport({
    host: s.smtp.host,
    port: s.smtp.port,
    secure: s.smtp.secure,
    auth: { user: s.smtp.user, pass: s.smtp.pass }
  });
};

// ─── PDF Generator ────────────────────────────────────────────────
const generatePDF = (emp, month, year) => {
  return new Promise((resolve, reject) => {
    const settings = readSettings();
    const { basic, earned, ot, payout, gross, attendanceCuts, lwop, advance, totalDeductions, net } = calcPayroll(emp);
    const slipMonth = month || emp.month || '';
    const slipYear  = year  || emp.year  || '';

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;   // 595.28
    const H = doc.page.height;  // 841.89
    const M = 40;               // margin
    const CW = W - M * 2;       // 515.28

    // 1. Full page outer border
    doc.lineWidth(1).strokeColor('#111827');
    doc.rect(M - 12, M - 12, CW + 24, H - (M - 12) * 2).stroke();

    let y = M;

    // 2. HEADER: Speakerbox Logo & Title
    const logoPath = path.join(__dirname, '../public/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, M, y, { height: 38 });
    } else {
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#000000').text('SPEAKER BOX', M, y);
    }

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000');
    doc.text('Salary Pay Slip', M, y + 10, { width: CW, align: 'center', underline: true });

    y += 58;

    // 3. EMPLOYEE DETAILS: Aligned 2-Column Key-Value Grid
    const colW = (CW - 24) / 2;
    const leftColX = M;
    const rightColX = M + colW + 24;

    const drawAlignedRow = (l1, v1, l2, v2, yPos) => {
      const lblW1 = 100;
      const valW1 = colW - lblW1 - 8;
      doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(l1, leftColX, yPos, { width: lblW1 - 10 });
      doc.text(':', leftColX + lblW1 - 10, yPos);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1e3a8a').text(v1 || '—', leftColX + lblW1, yPos, { width: valW1 });
      
      doc.lineWidth(0.5).strokeColor('#d1d5db').dash(2, { space: 2 });
      doc.moveTo(leftColX + lblW1, yPos + 12).lineTo(leftColX + colW, yPos + 12).stroke();

      const lblW2 = 90;
      const valW2 = colW - lblW2 - 8;
      doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(l2, rightColX, yPos, { width: lblW2 - 10 });
      doc.text(':', rightColX + lblW2 - 10, yPos);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1e3a8a').text(v2 || '—', rightColX + lblW2, yPos, { width: valW2 });

      doc.moveTo(rightColX + lblW2, yPos + 12).lineTo(rightColX + colW, yPos + 12).stroke();
      doc.undash();
    };

    const periodStr = [slipMonth, slipYear].filter(Boolean).join(' ') || '—';
    const designationStr = emp.position || emp.designation || '—';

    drawAlignedRow('Employee Name', emp.name, 'Employee ID', emp.id, y); y += 22;
    drawAlignedRow('Designation', designationStr, 'Location', emp.location || '—', y); y += 22;
    drawAlignedRow('Month & Year', periodStr, 'E-mail ID', emp.email || '—', y); y += 32;

    // 4. ATTENDANCE DETAILS
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Attendance Details', M, y);
    doc.moveTo(M, y + 14).lineTo(M + CW, y + 14).lineWidth(0.6).strokeColor('#e5e7eb').stroke();
    y += 20;

    const cW = CW / 4;
    const drawAttCell = (lbl, val, colIdx, rowY) => {
      const x = M + colIdx * cW;
      doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280').text(lbl, x + 8, rowY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a8a').text(String(val !== undefined && val !== null ? val : '0'), x + 8, rowY + 13);
    };

    // Box background
    doc.rect(M, y, CW, 70).lineWidth(0.5).strokeColor('#e5e7eb').fillAndStroke('#f9fafb', '#e5e7eb');

    const rhVal = emp.restrictedHoliday !== undefined ? emp.restrictedHoliday : (emp.rh !== undefined ? emp.rh : 0);
    drawAttCell('Present Days', emp.presentDays !== undefined ? emp.presentDays : 0, 0, y + 6);
    drawAttCell('Paid Days', emp.paidDays !== undefined ? emp.paidDays : 0, 1, y + 6);
    drawAttCell('Paid Leave', emp.paidLeave !== undefined ? emp.paidLeave : 0, 2, y + 6);
    drawAttCell('Restricted Holiday (RH)', rhVal, 3, y + 6);

    // Inner dividing line
    doc.moveTo(M + 8, y + 36).lineTo(M + CW - 8, y + 36).lineWidth(0.5).strokeColor('#e5e7eb').stroke();

    const openingLeaves = emp.balanceLeaves !== undefined ? emp.balanceLeaves : 0;
    const closingLeaves = emp.leaveBalance !== undefined ? emp.leaveBalance : (emp.balanceLeaves !== undefined ? Math.max(0, openingLeaves - (emp.paidLeave || 0)) : 0);

    drawAttCell('Balance Leaves (Opening)', openingLeaves, 0, y + 40);
    drawAttCell('Leave Balance (Closing)', closingLeaves, 1, y + 40);

    // Comments / Remarks
    const commX = M + 2 * cW;
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280').text('Comments / Remarks', commX + 8, y + 40);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#1e3a8a').text(emp.comments || 'nil', commX + 8, y + 53, { width: cW * 2 - 16 });

    y += 85;

    // 5. OFFICE USE ONLY (Earnings & Deductions)
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Office Use Only', M, y);
    doc.moveTo(M, y + 14).lineTo(M + CW, y + 14).lineWidth(0.6).strokeColor('#e5e7eb').stroke();
    y += 20;

    const halfW = (CW - 16) / 2;
    const leftX = M;
    const rightX = M + halfW + 16;

    // Table header bar
    doc.rect(leftX, y, halfW, 20).fill('#f3f4f6');
    doc.rect(rightX, y, halfW, 20).fill('#f3f4f6');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
    doc.text('EARNINGS', leftX + 10, y + 5);
    doc.text('AMOUNT (Rs.)', leftX, y + 5, { width: halfW - 10, align: 'right' });
    doc.text('DEDUCTIONS', rightX + 10, y + 5);
    doc.text('AMOUNT (Rs.)', rightX, y + 5, { width: halfW - 10, align: 'right' });
    y += 25;

    const earnRows = [
      ['Basic Pay', fmtNum(basic)],
      ['Earned Salary', fmtNum(earned)],
      ['Over Time (OT)', fmtNum(ot)],
      ['Pay Out', fmtNum(payout)]
    ];

    const dedRows = [
      ['Attendance Cuts', fmtNum(attendanceCuts)],
      ['LWOP (Leave Without Pay)', fmtNum(lwop)],
      ['Advance Salary', fmtNum(advance)],
      ['—', '0.00']
    ];

    for (let r = 0; r < 4; r++) {
      const [eLbl, eVal] = earnRows[r];
      const [dLbl, dVal] = dedRows[r];
      
      // Left side (Earnings)
      doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(eLbl, leftX + 10, y);
      doc.font('Helvetica').fontSize(9.5).fillColor('#111827').text(eVal, leftX, y, { width: halfW - 10, align: 'right' });

      // Right side (Deductions)
      doc.font('Helvetica').fontSize(9.5).fillColor('#374151').text(dLbl, rightX + 10, y);
      doc.font('Helvetica').fontSize(9.5).fillColor('#111827').text(dVal, rightX, y, { width: halfW - 10, align: 'right' });

      y += 20;
    }

    // Divider before totals
    doc.lineWidth(0.8).strokeColor('#9ca3af');
    doc.moveTo(leftX, y).lineTo(leftX + halfW, y).stroke();
    doc.moveTo(rightX, y).lineTo(rightX + halfW, y).stroke();
    y += 6;

    // Totals row: Gross Salary vs Total Deductions
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Gross Salary', leftX + 10, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Rs. ' + fmtNum(gross), leftX, y, { width: halfW - 10, align: 'right' });

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#991b1b').text('Total Deductions', rightX + 10, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#991b1b').text('Rs. ' + fmtNum(totalDeductions), rightX, y, { width: halfW - 10, align: 'right' });

    y += 26;

    // Bottom horizontal divider
    doc.lineWidth(0.5).strokeColor('#e5e7eb').moveTo(M, y).lineTo(M + CW, y).stroke();
    y += 22;

    // 6. NET SALARY & PAID VIA
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Net Salary :', M, y + 7);
    const netBoxW = 160;
    const netBoxH = 28;
    doc.rect(M + 75, y, netBoxW, netBoxH).lineWidth(1.2).strokeColor('#15803d').fillAndStroke('#f0fdf4', '#15803d');
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#15803d').text('Rs. ' + Number(net).toLocaleString('en-IN') + '/-', M + 75, y + 7, { width: netBoxW, align: 'center' });

    doc.font('Helvetica').fontSize(10).fillColor('#374151').text('Paid Via :', M + 270, y + 8);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#15803d').text(emp.via || 'Bank', M + 325, y + 7);

    y += 75;

    // 7. SIGNATURES
    const sigPath = path.join(__dirname, '../public/signature.png');
    if (fs.existsSync(sigPath)) {
      doc.image(sigPath, M + 65, y - 22, { height: 42 });
    }

    doc.font('Helvetica').fontSize(10).fillColor('#374151');
    doc.text('Accounts :', M, y);
    doc.text('Managing Partner :', M + 240, y);

    doc.end();
  });
};

// ─── Template renderer ────────────────────────────────────────────
const renderTemplate = (template, emp, month, year) => {
  const { basic, earned, ot, payout, gross, attendanceCuts, lwop, advance, totalDeductions, net } = calcPayroll(emp);
  const slipMonth = month || emp.month || '';
  const slipYear  = year  || emp.year  || '';
  return template
    .replace(/{{name}}/g,            emp.name || '')
    .replace(/{{id}}/g,              emp.id   || '')
    .replace(/{{email}}/g,           emp.email || '')
    .replace(/{{department}}/g,      emp.department || '')
    .replace(/{{position}}/g,        emp.position   || '')
    .replace(/{{designation}}/g,     emp.position || emp.designation || '')
    .replace(/{{location}}/g,        emp.location   || '')
    .replace(/{{month}}/g,           slipMonth)
    .replace(/{{year}}/g,            slipYear)
    .replace(/{{basic}}/g,           fmt(basic))
    .replace(/{{earned}}/g,          fmt(earned))
    .replace(/{{ot}}/g,              fmt(ot))
    .replace(/{{payout}}/g,          fmt(payout))
    .replace(/{{bonus}}/g,           fmt(payout))
    .replace(/{{stipend}}/g,         fmt(emp.stipend))
    .replace(/{{ta}}/g,              fmt(emp.ta))
    .replace(/{{gross}}/g,           fmt(gross))
    .replace(/{{attendanceCuts}}/g,  fmt(attendanceCuts))
    .replace(/{{lwop}}/g,            fmt(lwop))
    .replace(/{{advance}}/g,         fmt(advance))
    .replace(/{{deductions}}/g,      fmt(totalDeductions))
    .replace(/{{netPay}}/g,          fmt(net))
    .replace(/{{net}}/g,             fmt(net))
    .replace(/{{presentDays}}/g,     String(emp.presentDays !== undefined ? emp.presentDays : '0'))
    .replace(/{{paidDays}}/g,        String(emp.paidDays !== undefined ? emp.paidDays : '0'))
    .replace(/{{paidLeave}}/g,       String(emp.paidLeave !== undefined ? emp.paidLeave : '0'))
    .replace(/{{balanceLeaves}}/g,   String(emp.balanceLeaves !== undefined ? emp.balanceLeaves : '0'))
    .replace(/{{leaveBalance}}/g,    String(emp.leaveBalance !== undefined ? emp.leaveBalance : '0'))
    .replace(/{{comments}}/g,        emp.comments || '')
    .replace(/{{via}}/g,             emp.via || 'Bank');
};

const DEFAULT_SUBJECT = 'Salary Slip for {{month}} {{year}} – {{name}}';
const DEFAULT_BODY =
`Dear {{name}},

Please find attached your salary slip for the month of {{month}} {{year}}. A summary is provided below for your reference:

Gross Salary: {{gross}}
Total Deductions: {{deductions}}
Net Amount: {{net}}

Best regards,

Anshad
Accountant
Speakerbox Media LLP
https://hello.speakerbox.agency/anshad`;

// ─── Send salary slip email ───────────────────────────────────────
const sendSalarySlip = async (emp, month, year, subjectTpl, bodyTpl) => {
  const settings = readSettings();
  if (!settings.smtp.user || !settings.smtp.pass) {
    throw new Error('SMTP not configured. Go to Settings and enter your email credentials.');
  }
  const slipMonth = month || emp.month || '';
  const slipYear  = year  || emp.year  || '';

  const subject    = renderTemplate(subjectTpl || DEFAULT_SUBJECT, emp, slipMonth, slipYear);
  const textBody   = renderTemplate(bodyTpl    || DEFAULT_BODY,    emp, slipMonth, slipYear);
  const pdfBuffer  = await generatePDF(emp, slipMonth, slipYear);
  const transporter = getTransporter();

  // Convert text to HTML and prepare attachments
  let htmlBody = textBody.replace(/\n/g, '<br/>');
  const attachments = [{
    filename:    `SalarySlip_${emp.id}_${slipMonth}_${slipYear}.pdf`,
    content:     pdfBuffer,
    contentType: 'application/pdf'
  }];

  const sigPath = require('path').join(__dirname, '../public/email_signature.jpg');
  if (require('fs').existsSync(sigPath)) {
    htmlBody += `<br/><br/><img src="cid:emailsig" style="max-width: 200px; height: auto;" />`;
    attachments.push({
      filename: 'email_signature.jpg',
      path: sigPath,
      cid: 'emailsig'
    });
  }

  await transporter.sendMail({
    from:    `"${settings.smtp.fromName}" <${settings.smtp.user}>`,
    to:      emp.email,
    subject,
    html:    htmlBody,
    text:    textBody, // Fallback
    attachments
  });
};

module.exports = { sendSalarySlip, generatePDF, calcPayroll };
