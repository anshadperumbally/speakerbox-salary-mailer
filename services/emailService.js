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
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─── Calculate derived fields ─────────────────────────────────────
const calcPayroll = (emp) => {
  const gross = parseFloat(emp.gross || 0) ||
    (parseFloat(emp.earned || 0) ||
    ((parseFloat(emp.basic || 0) + parseFloat(emp.ot || 0) + parseFloat(emp.bonus || 0))));

  const totalDeductions = parseFloat(emp.attendanceCuts || 0) +
                          parseFloat(emp.leaveCut || 0) +
                          parseFloat(emp.advance || 0);

  const net = parseFloat(emp.net || 0) || (gross - totalDeductions);

  return { gross, totalDeductions, net };
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
    const { gross, totalDeductions, net } = calcPayroll(emp);
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
    const CW = W - M * 2;       // content width

    // Full page outer black border
    doc.lineWidth(0.5);
    doc.rect(M - 10, M - 10, CW + 20, H - (M - 10) * 2).stroke('#000000');

    let y = M;

    // --- SPEAKER BOX LOGO (Image) ---
    const logoPath = require('path').join(__dirname, '../public/logo.png');
    if (require('fs').existsSync(logoPath)) {
      doc.image(logoPath, M - 5, y - 5, { height: 40 });
    } else {
      doc.font('Helvetica-Bold').fontSize(24).fillColor('#000000').text('SPEAKER BOX', M, y);
    }

    // Title "Salary Pay Slip"
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000');
    // We want the text underlined
    doc.text('Salary Pay Slip', M, y + 20, { width: CW, align: 'center', underline: true });
    
    y += 70;

    // Standard styling variables
    const labelColor = '#000000';
    const valColor = '#000080'; // Dark blue for inputs
    const lineYOff = 12;

    const drawFieldLine = (startX, fieldW, curY, isDotted = true) => {
      doc.lineWidth(0.5).strokeColor('#cccccc');
      if (isDotted) {
        doc.dash(2, { space: 2 });
      } else {
        doc.undash();
      }
      doc.moveTo(startX, curY + lineYOff).lineTo(startX + fieldW, curY + lineYOff).stroke();
      doc.undash();
    };

    // Employee Name & Position
    doc.font('Helvetica').fontSize(10).fillColor(labelColor);
    doc.text('Employee Name:', M, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.name || '', M + 90, y - 1);
    drawFieldLine(M + 80, CW - 80, y);
    y += 20;

    // ID & Designation
    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Employee ID:', M, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.id || '', M + 80, y - 1, { width: 100, align: 'center' });
    drawFieldLine(M + 80, 100, y);

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Designation:', M + 190, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.position || '', M + 260, y - 1);
    drawFieldLine(M + 260, CW - 260, y);
    y += 20;

    // Month & Year & Location
    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Month:', M, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(slipMonth, M + 40, y - 1, { width: 80, align: 'center' });
    drawFieldLine(M + 40, 80, y);

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Year :', M + 130, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(slipYear, M + 170, y - 1, { width: 60, align: 'center' });
    drawFieldLine(M + 170, 60, y);

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Location:', M + 245, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.location || '', M + 300, y - 1, { width: 100, align: 'center' });
    drawFieldLine(M + 295, CW - 295, y);
    y += 20;

    // E-mail ID
    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('E-mail ID:', M, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.email || '', M + 60, y - 1);
    drawFieldLine(M + 50, CW - 50, y);
    y += 30;

    // --- ATTENDANCE ---
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text('Attendance', M, y, { underline: true });
    y += 25;
    
    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Present Days :', M, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.presentDays || '0', M + 75, y - 1, { width: 30, align: 'center' });
    drawFieldLine(M + 70, 40, y);

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Paid Days :', M + 130, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.paidDays || '0', M + 195, y - 1, { width: 30, align: 'center' });
    drawFieldLine(M + 190, 40, y);

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Paid Leave :', M + 250, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.paidLeave || '0', M + 315, y - 1, { width: 30, align: 'center' });
    drawFieldLine(M + 310, 40, y);

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Restricted Holiday:', M + 360, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.restrictedHoliday || '0', M + 460, y - 1, { width: 40, align: 'center' });
    drawFieldLine(M + 455, CW - 455, y);

    y += 20;

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Balance Leaves :', M, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.balanceLeaves || '0', M + 85, y - 1, { width: 40, align: 'center' });
    drawFieldLine(M + 80, 50, y);

    doc.font('Helvetica').fontSize(10).fillColor(labelColor).text('Leave Balance :', M + 150, y);
    doc.font('Helvetica-Bold').fillColor(valColor).text(emp.leaveBalance || '0', M + 235, y - 1, { width: 40, align: 'center' });
    drawFieldLine(M + 230, 50, y);
    y += 30;

    // Employee comments section removed per layout tweak

    // Bank Account Details section was removed per requested layout adjust.


    // --- OFFICE USE ONLY ---
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#000000').text('Office Use Only', M, y, { underline: true });
    y += 25;

    const drawOfficeRow = (label1, val1, label2, val2, yPos, isBold1 = false, isBold2 = false) => {
      // col 1
      if(label1) {
        doc.font(isBold1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000000').text(label1, M, yPos, {width: 250});
        doc.text(':', M + 175, yPos);
        const dispVal1 = isNaN(parseFloat(val1)) ? val1 : parseFloat(val1 || 0).toFixed(2);
        const vPrint = (label1 === 'Basic Salary' || label1 === 'Earned Salary') ? "Rs. " + dispVal1.replace('.00','') : dispVal1;
        doc.font('Helvetica-Bold').fillColor('#000000').text(vPrint, M + 190, yPos, {width: 70, align: 'right'});
      }
      
      // col 2
      if(label2) {
        doc.font(isBold2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#000000').text(label2, M + 285, yPos, {width: 165});
        doc.text(':', M + 450, yPos);
        const dispVal2 = isNaN(parseFloat(val2)) ? val2 : parseFloat(val2 || 0).toFixed(2);
        const clr2 = label2 === 'Total Deduction' ? '#cc0000' : '#000000';
        doc.font('Helvetica-Bold').fillColor(clr2).text(dispVal2, M + 465, yPos, {width: 45, align: 'right'});
      }
    };

    drawOfficeRow('Basic Pay', emp.basic, 'Attendance Cuts', emp.attendanceCuts, y); y += 22;
    drawOfficeRow('OT', emp.ot, 'Leave Cut', emp.leaveCut, y); y += 22;
    drawOfficeRow('Bonus', emp.bonus, 'Advance Salary', emp.advance, y); y += 22;

    doc.moveTo(M, y-4).lineTo(M + CW, y-4).strokeColor('#cccccc').lineWidth(0.5).stroke();

    drawOfficeRow('Earned Salary', emp.earned || gross, 'Total Deduction', totalDeductions, y, false, true); y += 20;

    doc.moveTo(M, y-2).lineTo(M + CW, y-2).strokeColor('#cccccc').lineWidth(0.5).stroke();

    doc.font('Helvetica').fontSize(10).fillColor('#000000').text('Gross Salary', M, y);
    doc.font('Helvetica-Bold').fillColor('#000000').text(': ' + parseFloat(emp.gross || gross).toFixed(2), M + 450, y, {width: 60, align: 'right'});
    
    y += 10;
    doc.moveTo(M, y+5).lineTo(M + CW, y+5).strokeColor('#cccccc').dash(1, {space:1}).lineWidth(0.5).stroke();
    doc.undash();
    
    y += 35;

    // NET SALARY Box
    doc.font('Helvetica').fontSize(10).fillColor('#000000').text('Net Salary       :', M, y+6);
    
    doc.rect(M + 80, y, 140, 24).strokeColor('#000000').lineWidth(1.2).stroke();
    const netStr = Number(emp.net || net).toLocaleString('en-IN');
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#007800').text('Rs. ' + netStr + '/-', M + 80, y + 5, {width: 140, align: 'center'});

    // Paid Via
    doc.font('Helvetica').fontSize(10).fillColor('#000000').text('Paid Via     :', M + 260, y + 6);
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#007800').text(emp.via || 'Bank', M + 325, y + 4);

    y += 70;

    const signaturePath = require('path').join(__dirname, '../public/signature.png');
    if (require('fs').existsSync(signaturePath)) {
      // Shifted left 55px (from M+95 to M+40) to account for transparent padding in image
      doc.image(signaturePath, M + 40, y - 40, { height: 60 });
    }

    doc.font('Helvetica').fontSize(12).fillColor('#000000').text('Accounts :', M + 20, y);
    doc.text('Managing Partner :', M + 200, y);

    doc.end();
  });
};

// ─── Template renderer ────────────────────────────────────────────
const renderTemplate = (template, emp, month, year) => {
  const { gross, totalDeductions, net } = calcPayroll(emp);
  const slipMonth = month || emp.month || '';
  const slipYear  = year  || emp.year  || '';
  return template
    .replace(/{{name}}/g,        emp.name || '')
    .replace(/{{id}}/g,          emp.id   || '')
    .replace(/{{email}}/g,       emp.email || '')
    .replace(/{{department}}/g,  emp.department || '')
    .replace(/{{position}}/g,    emp.position   || '')
    .replace(/{{month}}/g,       slipMonth)
    .replace(/{{year}}/g,        slipYear)
    .replace(/{{basic}}/g,       fmt(emp.basic))
    .replace(/{{ot}}/g,          fmt(emp.ot))
    .replace(/{{bonus}}/g,       fmt(emp.bonus))
    .replace(/{{stipend}}/g,     fmt(emp.stipend))
    .replace(/{{ta}}/g,          fmt(emp.ta))
    .replace(/{{gross}}/g,       fmt(gross))
    .replace(/{{earned}}/g,      fmt(emp.earned || gross))
    .replace(/{{advance}}/g,     fmt(emp.advance))
    .replace(/{{deductions}}/g,  fmt(totalDeductions))
    .replace(/{{netPay}}/g,      fmt(net))
    .replace(/{{net}}/g,         fmt(net))
    .replace(/{{via}}/g,         emp.via || 'Bank');
};

const DEFAULT_SUBJECT = 'Salary Slip for {{month}} {{year}} – {{name}}';
const DEFAULT_BODY =
`Dear {{name}},

Please find attached your salary slip for the month of {{month}}. A summary is provided below for your reference:

Total Earned Salary: {{earned}}

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
