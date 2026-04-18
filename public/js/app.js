/* ============================
   PaySlip Pro – Main App JS
   ============================ */

let allEmployees = [];
let currentPage = 'dashboard';

// ─── Navigation ─────────────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  document.getElementById(`nav-${page}`).classList.add('active');
  currentPage = page;
  if (page === 'dashboard') loadDashboard();
  if (page === 'employees') renderEmployeesTable();
  if (page === 'compose') initCompose();
  if (page === 'logs') loadLogs();
  if (page === 'settings') loadSettings();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// ─── API Helpers ─────────────────────────────────────────────────
async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  return res.json();
}

// ─── Toast ────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.classList.add('toast-hide'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ─── Employees ───────────────────────────────────────────────────
async function fetchEmployees() {
  allEmployees = await api('/api/employees');
  return allEmployees;
}

function calcNet(emp) {
  const gross = parseFloat(emp.gross || 0) || (parseFloat(emp.earned || 0) || ((parseFloat(emp.basic || 0) + parseFloat(emp.ot || 0) + parseFloat(emp.bonus || 0))));
  const deductions = parseFloat(emp.attendanceCuts || 0) + parseFloat(emp.leaveCut || 0) + parseFloat(emp.advance || 0);
  return parseFloat(emp.net || 0) || (gross - deductions);
}

function formatINR(n) {
  return '₹' + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function renderEmployeesTable() {
  fetchEmployees().then(() => {
    populateDeptFilter('dept-filter');
    filterEmployees();
  });
}

function filterEmployees() {
  const q = (document.getElementById('emp-search')?.value || '').toLowerCase();
  const dept = document.getElementById('dept-filter')?.value || '';
  let filtered = allEmployees.filter(e => {
    const matchQ = !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q);
    const matchD = !dept || e.department === dept;
    return matchQ && matchD;
  });
  const tbody = document.getElementById('employees-tbody');
  const empty = document.getElementById('emp-empty');
  const table = document.getElementById('employees-table');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = 'table';

  tbody.innerHTML = filtered.map(emp => `
    <tr>
      <td><span class="emp-id-badge">${emp.id}</span></td>
      <td class="emp-name">${emp.name}</td>
      <td>${emp.department || emp.position || '—'}</td>
      <td style="color:var(--text-secondary)">${emp.position || '—'}</td>
      <td class="net-pay">${formatINR(emp.net || 0)}</td>
      <td style="color:var(--text-secondary);font-size:11px">${emp.email}</td>
      <td style="color:var(--text-muted);font-size:11px">${emp.month || '—'} ${emp.year || ''}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="previewPDF('${emp.id}')" title="Preview PDF">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button class="btn-icon edit" onclick="openEmployeeModal('${emp.id}')" title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon delete" onclick="deleteEmployee('${emp.id}')" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function populateDeptFilter(selectId) {
  const depts = [...new Set(allEmployees.map(e => e.department).filter(Boolean))];
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">All Departments</option>` + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  sel.value = current;
}

// ─── Employee Modal ───────────────────────────────────────────────
function openEmployeeModal(id = null) {
  const modal = document.getElementById('employee-modal');
  modal.style.display = 'flex';
  const fields = ['id','name','email','joining','dept','pos','basic','hra','da','conv','med','pf','tds','other'];
  fields.forEach(f => document.getElementById(`emp-${f}`).value = '');
  document.getElementById('emp-edit-id').value = '';
  document.getElementById('modal-title').textContent = 'Add Employee';

  if (id) {
    const emp = allEmployees.find(e => e.id === id);
    if (!emp) return;
    document.getElementById('modal-title').textContent = 'Edit Employee';
    document.getElementById('emp-edit-id').value = emp.id;
    document.getElementById('emp-id').value = emp.id;
    document.getElementById('emp-name').value = emp.name;
    document.getElementById('emp-email').value = emp.email;
    document.getElementById('emp-joining').value = emp.joiningDate || '';
    document.getElementById('emp-dept').value = emp.department || '';
    document.getElementById('emp-pos').value = emp.position || '';
    document.getElementById('emp-basic').value = emp.basic || '';
    document.getElementById('emp-hra').value = emp.hra || '';
    document.getElementById('emp-da').value = emp.da || '';
    document.getElementById('emp-conv').value = emp.conveyance || '';
    document.getElementById('emp-med').value = emp.medical || '';
    document.getElementById('emp-pf').value = emp.pf || '';
    document.getElementById('emp-tds').value = emp.tds || '';
    document.getElementById('emp-other').value = emp.otherDeductions || '';
  }
}

function closeEmployeeModal() {
  document.getElementById('employee-modal').style.display = 'none';
}

async function saveEmployee() {
  const editId = document.getElementById('emp-edit-id').value;
  const body = {
    id: document.getElementById('emp-id').value.trim(),
    name: document.getElementById('emp-name').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    joiningDate: document.getElementById('emp-joining').value,
    department: document.getElementById('emp-dept').value.trim(),
    position: document.getElementById('emp-pos').value.trim(),
    basic: document.getElementById('emp-basic').value,
    hra: document.getElementById('emp-hra').value,
    da: document.getElementById('emp-da').value,
    conveyance: document.getElementById('emp-conv').value,
    medical: document.getElementById('emp-med').value,
    pf: document.getElementById('emp-pf').value,
    tds: document.getElementById('emp-tds').value,
    otherDeductions: document.getElementById('emp-other').value
  };
  if (!body.name || !body.email) { toast('Name and email are required', 'error'); return; }
  let res;
  if (editId) {
    res = await api(`/api/employees/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
  } else {
    res = await api('/api/employees', { method: 'POST', body: JSON.stringify(body) });
  }
  if (res.success) {
    toast(editId ? 'Employee updated!' : 'Employee added!', 'success');
    closeEmployeeModal();
    await fetchEmployees();
    filterEmployees();
    if (currentPage === 'dashboard') loadDashboard();
  } else {
    toast(res.error || 'Failed to save', 'error');
  }
}

async function deleteEmployee(id) {
  if (!confirm('Delete this employee?')) return;
  const res = await api(`/api/employees/${id}`, { method: 'DELETE' });
  if (res.success) {
    toast('Employee deleted', 'info');
    await fetchEmployees();
    filterEmployees();
    if (currentPage === 'dashboard') loadDashboard();
  }
}

function triggerCSVImport() { document.getElementById('csv-file-input').click(); }

async function importCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('csv', file);
  toast('Importing CSV…', 'info');
  const res = await fetch('/api/employees/import', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) {
    toast(`✅ Imported ${data.imported} employee${data.imported !== 1 ? 's' : ''} successfully!`, 'success');
    await fetchEmployees();
    filterEmployees();
    if (currentPage === 'dashboard') loadDashboard();
  } else {
    toast('❌ Import failed: ' + (data.error || 'Unknown error'), 'error');
  }
  input.value = '';
}

function downloadSampleCSV() {
  window.location.href = '/api/employees/sample-csv';
}

async function previewPDF(id) {
  const emp = allEmployees.find(e => e.id === id);
  if (!emp) return;
  const month = emp.month || new Date().toLocaleString('en-IN', { month: 'long' });
  const year  = emp.year  || new Date().getFullYear();
  toast('Generating PDF preview…', 'info');
  try {
    const res = await fetch('/api/mail/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: id, month, year })
    });
    if (!res.ok) { const e = await res.json(); toast('PDF error: ' + e.error, 'error'); return; }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
  } catch (err) {
    toast('PDF preview failed: ' + err.message, 'error');
  }
}

// ─── Dashboard ────────────────────────────────────────────────────
async function loadDashboard() {
  await fetchEmployees();
  const logs = await api('/api/mail/logs');

  const totalSent = logs.reduce((s, l) => s + (l.sent || 0), 0);
  const totalFailed = logs.reduce((s, l) => s + (l.failed || 0), 0);
  const totalNet = allEmployees.reduce((s, e) => s + calcNet(e), 0);

  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon purple">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      </div>
      <div><div class="stat-value">${allEmployees.length}</div><div class="stat-label">Total Employees</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon green">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </div>
      <div><div class="stat-value">${totalSent}</div><div class="stat-label">Emails Sent</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon red">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div><div class="stat-value">${totalFailed}</div><div class="stat-label">Failed Deliveries</div></div>
    </div>
    <div class="stat-card">
      <div class="stat-icon yellow">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </div>
      <div><div class="stat-value">${formatINR(totalNet)}</div><div class="stat-label">Total Payroll/mo</div></div>
    </div>`;

  // Recent Activity
  const recent = logs.slice(0, 5);
  const actEl = document.getElementById('recent-activity');
  if (recent.length === 0) {
    actEl.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-icon">📬</div><p>No emails sent yet</p></div>';
  } else {
    actEl.innerHTML = recent.map(l => {
      const d = new Date(l.timestamp);
      const timeStr = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      return `<div class="activity-item">
        <div class="activity-dot ${l.failed > 0 ? 'failed' : 'success'}"></div>
        <div class="activity-text">Sent ${l.sent} slips for <strong>${l.month} ${l.year}</strong> (${l.failed} failed)</div>
        <div class="activity-time">${timeStr}</div>
      </div>`;
    }).join('');
  }

  // Dept Breakdown
  const depts = {};
  allEmployees.forEach(e => { const d = e.department || 'N/A'; depts[d] = (depts[d] || 0) + 1; });
  const maxCount = Math.max(...Object.values(depts), 1);
  const deptEl = document.getElementById('dept-breakdown');
  if (Object.keys(depts).length === 0) {
    deptEl.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-icon">🏢</div><p>No departments yet</p></div>';
  } else {
    deptEl.innerHTML = Object.entries(depts).sort((a,b) => b[1]-a[1]).map(([name, count]) => `
      <div class="dept-row">
        <span class="dept-name">${name}</span>
        <div class="dept-bar-wrap"><div class="dept-bar" style="width:${Math.round(count/maxCount*100)}%"></div></div>
        <span class="dept-count">${count}</span>
      </div>`).join('');
  }
}

// ─── Compose ──────────────────────────────────────────────────────
async function initCompose() {
  await fetchEmployees();

  // Populate year selector
  const yearSel = document.getElementById('salary-year');
  const thisYear = new Date().getFullYear();
  yearSel.innerHTML = [thisYear-1, thisYear, thisYear+1].map(y => `<option value="${y}" ${y===thisYear?'selected':''}>${y}</option>`).join('');

  // Set current month
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('salary-month').value = months[new Date().getMonth()];

  // Populate dept selector
  const depts = [...new Set(allEmployees.map(e => e.department).filter(Boolean))];
  const deptSel = document.getElementById('compose-dept');
  deptSel.innerHTML = `<option value="all">All Departments</option>` + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  deptSel.onchange = updateSendSummary;

  // Checklist
  const cl = document.getElementById('employee-checklist');
  cl.innerHTML = allEmployees.map(e => `
    <label class="checklist-item">
      <input type="checkbox" value="${e.id}" checked onchange="updateSendSummary()"/>
      <span>${e.name}</span><span style="color:var(--text-muted);font-size:11px;margin-left:auto">${e.department||''}</span>
    </label>`).join('');

  updateSendSummary();
}

function updateRecipients(radio) {
  document.getElementById('dept-selector').style.display  = radio.value === 'department' ? 'block' : 'none';
  document.getElementById('custom-selector').style.display = radio.value === 'custom'     ? 'block' : 'none';
  updateSendSummary();
}

function updateSendSummary() {
  const target = document.querySelector('input[name="sendTarget"]:checked')?.value || 'all';
  let count = allEmployees.length;
  if (target === 'department') {
    const dept = document.getElementById('compose-dept')?.value || 'all';
    count = dept === 'all' ? allEmployees.length : allEmployees.filter(e => e.department === dept).length;
  } else if (target === 'custom') {
    count = document.querySelectorAll('#employee-checklist input:checked').length;
  }
  const month = document.getElementById('salary-month')?.value || '';
  const year  = document.getElementById('salary-year')?.value || '';
  document.getElementById('recipients-summary').textContent = `📧 ${count} employee${count !== 1 ? 's' : ''} selected`;
  document.getElementById('send-summary-text').textContent = `Ready to send ${count} salary slip${count !== 1 ? 's' : ''} for ${month} ${year}`;
}

async function sendEmails() {
  const target = document.querySelector('input[name="sendTarget"]:checked')?.value || 'all';
  const month = document.getElementById('salary-month').value;
  const year  = document.getElementById('salary-year').value;
  const subject = document.getElementById('email-subject').value;
  const bodyTemplate = document.getElementById('email-body').value;

  let employeeIds = [];
  let sendAll = false;
  let department = '';

  if (target === 'all') {
    sendAll = true;
  } else if (target === 'department') {
    department = document.getElementById('compose-dept').value;
    if (department === 'all') sendAll = true;
  } else {
    employeeIds = [...document.querySelectorAll('#employee-checklist input:checked')].map(i => i.value);
    if (employeeIds.length === 0) { toast('Select at least one employee', 'error'); return; }
  }

  const empsToSend = sendAll ? allEmployees : (department ? allEmployees.filter(e => e.department === department) : allEmployees.filter(e => employeeIds.includes(e.id)));
  const total = empsToSend.length;
  if (total === 0) { toast('No employees to send', 'error'); return; }

  // Show progress
  const overlay = document.getElementById('send-overlay');
  const bar = document.getElementById('progress-bar');
  const count = document.getElementById('progress-count');
  overlay.style.display = 'flex';
  bar.style.width = '0%';
  count.textContent = `0 / ${total}`;

  // Animate progress (fake until response)
  let prog = 0;
  const interval = setInterval(() => {
    prog = Math.min(prog + (90 / total), 88);
    bar.style.width = prog + '%';
    count.textContent = `${Math.floor(prog / 100 * total)} / ${total}`;
  }, 300);

  try {
    const res = await api('/api/mail/send', {
      method: 'POST',
      body: JSON.stringify({ employeeIds, month, year, subject, bodyTemplate, sendAll, department })
    });
    clearInterval(interval);
    bar.style.width = '100%';
    count.textContent = `${total} / ${total}`;

    setTimeout(() => {
      overlay.style.display = 'none';
      const sent = res.results.filter(r => r.status === 'sent').length;
      const failed = res.results.filter(r => r.status === 'failed').length;
      if (failed === 0) {
        toast(`✅ All ${sent} salary slips sent successfully!`, 'success');
      } else {
        toast(`Sent: ${sent} ✓  |  Failed: ${failed} ✗`, failed === total ? 'error' : 'info');
      }
    }, 600);
  } catch (err) {
    clearInterval(interval);
    overlay.style.display = 'none';
    toast('Failed to send emails: ' + err.message, 'error');
  }
}

// ─── Logs ─────────────────────────────────────────────────────────
async function loadLogs() {
  const logs = await api('/api/mail/logs');
  const container = document.getElementById('logs-container');
  if (logs.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:80px"><div class="empty-icon">📋</div><h3>No logs yet</h3><p>Send salary slips to see delivery history here</p></div>`;
    return;
  }
  container.innerHTML = logs.map(log => {
    const d = new Date(log.timestamp);
    const dateStr = d.toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' });
    return `
      <div class="log-batch">
        <div class="log-batch-header">
          <div>
            <div class="log-title">📅 ${log.month} ${log.year} — Batch #${log.batchId.slice(-6)}</div>
            <div class="log-meta">${dateStr}</div>
          </div>
          <div class="log-stats">
            <span class="log-stat success">✓ ${log.sent} Sent</span>
            <span class="log-stat failed">✗ ${log.failed} Failed</span>
          </div>
        </div>
        <div class="log-results">
          ${(log.results || []).map(r => `
            <div class="log-result-row">
              <div class="status-dot ${r.status}"></div>
              <span class="log-emp-name">${r.name}</span>
              <span class="log-emp-email">${r.email}</span>
              ${r.error ? `<span class="log-error">${r.error}</span>` : ''}
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// ─── Settings ─────────────────────────────────────────────────────
async function loadSettings() {
  const s = await api('/api/settings');
  document.getElementById('company-name').value    = s.companyName || '';
  document.getElementById('company-address').value = s.companyAddress || '';
  document.getElementById('company-email').value   = s.companyEmail || '';
  document.getElementById('smtp-host').value       = s.smtp?.host || '';
  document.getElementById('smtp-port').value       = s.smtp?.port || '';
  document.getElementById('smtp-user').value       = s.smtp?.user || '';
  document.getElementById('smtp-pass').value       = ''; // never pre-fill password
  document.getElementById('smtp-fromName').value   = s.smtp?.fromName || '';
  document.getElementById('smtp-secure').checked   = s.smtp?.secure || false;
}

async function saveSettings() {
  const body = {
    companyName:    document.getElementById('company-name').value,
    companyAddress: document.getElementById('company-address').value,
    companyEmail:   document.getElementById('company-email').value,
    smtp: {
      host:     document.getElementById('smtp-host').value,
      port:     document.getElementById('smtp-port').value,
      user:     document.getElementById('smtp-user').value,
      pass:     document.getElementById('smtp-pass').value,
      fromName: document.getElementById('smtp-fromName').value,
      secure:   document.getElementById('smtp-secure').checked
    }
  };
  const res = await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
  if (res.success) toast('Settings saved!', 'success');
  else toast('Failed to save settings', 'error');
}

async function testSMTP() {
  const btn = document.getElementById('test-smtp-btn');
  btn.disabled = true;
  btn.textContent = 'Testing…';
  try {
    const res = await api('/api/settings/test', { method: 'POST' });
    if (res.success) toast('✅ SMTP connection successful!', 'success');
    else toast('❌ ' + (res.error || 'Connection failed'), 'error');
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.60 3.35 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg> Test Connection`;
}

function applyPreset(type) {
  const presets = {
    cpanel:  { host: 'mail.speakerbox.in', port: 587, secure: false },
    gmail:   { host: 'smtp.gmail.com',     port: 587, secure: false },
    zoho:    { host: 'smtp.zoho.in',       port: 587, secure: false },
    outlook: { host: 'smtp.office365.com', port: 587, secure: false }
  };
  const p = presets[type];
  if (!p) return;
  document.getElementById('smtp-host').value     = p.host;
  document.getElementById('smtp-port').value     = p.port;
  document.getElementById('smtp-secure').checked = p.secure;
  const labels = { cpanel: 'cPanel/Hosting', gmail: 'Gmail', zoho: 'Zoho Mail', outlook: 'Outlook 365' };
  toast(`Applied ${labels[type]} preset — enter your password and save!`, 'info');
}

function togglePassVisibility() {
  const inp = document.getElementById('smtp-pass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

// ─── Close modal on overlay click ──────────────────────────────────
document.getElementById('employee-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeEmployeeModal();
});

// ─── Init ─────────────────────────────────────────────────────────
loadDashboard();
