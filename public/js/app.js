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

async function fetchEmployees() {
  if (allEmployees.length > 0) return allEmployees;
  try {
    const saved = localStorage.getItem('allEmployees');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        allEmployees = parsed;
        return allEmployees;
      }
    }
  } catch {}
  allEmployees = await api('/api/employees');
  return allEmployees;
}

function calcNet(emp) {
  if (!emp) return 0;
  const basic = parseFloat(emp.basic || 0);
  const rawEarned = parseFloat(emp.earned || 0);
  const earned = rawEarned > 0 ? rawEarned : basic;
  const ot = parseFloat(emp.ot || 0);
  const payout = parseFloat(emp.payout || emp.bonus || emp.stipend || emp.ta || 0);
  const gross = parseFloat(emp.gross || 0) || (earned + ot + payout);

  const attendanceCuts = parseFloat(emp.attendanceCuts || 0);
  const lwop = parseFloat(emp.lwop || emp.leaveCut || 0);
  const advance = parseFloat(emp.advance || 0);
  const totalDeductions = parseFloat(emp.totalDeductions || emp.total || emp.deduction || 0) || (attendanceCuts + lwop + advance);

  const rawNet = parseFloat(emp.net || 0);
  return rawNet > 0 ? rawNet : Math.max(0, gross - totalDeductions);
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
    const matchQ = !q || 
      (e.name || '').toLowerCase().includes(q) || 
      (e.id || '').toLowerCase().includes(q) || 
      (e.position || e.designation || '').toLowerCase().includes(q) || 
      (e.location || '').toLowerCase().includes(q) || 
      (e.department || '').toLowerCase().includes(q);
    const matchD = !dept || e.department === dept || e.location === dept;
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

  tbody.innerHTML = filtered.map(emp => {
    const basic = parseFloat(emp.basic || 0);
    const earned = parseFloat(emp.earned || 0) || basic;
    const ot = parseFloat(emp.ot || 0);
    const payout = parseFloat(emp.payout || emp.bonus || 0);
    const gross = parseFloat(emp.gross || 0) || (earned + ot + payout);
    const deductions = parseFloat(emp.totalDeductions || emp.total || 0) || (parseFloat(emp.attendanceCuts || 0) + parseFloat(emp.lwop || emp.leaveCut || 0) + parseFloat(emp.advance || 0));
    const net = parseFloat(emp.net || 0) || Math.max(0, gross - deductions);

    const emailDisplay = emp.email 
      ? `<span style="color:var(--text-secondary);font-size:11px">${emp.email}</span>` 
      : `<span style="color:#f59e0b;font-size:11px;font-style:italic">No email</span>`;

    return `
      <tr>
        <td><input type="checkbox" class="emp-checkbox" value="${emp.id}" onchange="updateSelectionUI()"/></td>
        <td><span class="emp-id-badge">${emp.id}</span></td>
        <td class="emp-name">${emp.name}</td>
        <td style="color:var(--text-secondary)">${emp.position || emp.designation || '—'}</td>
        <td style="color:var(--text-secondary)">${emp.location || '—'}</td>
        <td style="color:var(--text-secondary)">${formatINR(earned)}</td>
        <td style="color:var(--text-primary);font-weight:600">${formatINR(gross)}</td>
        <td style="color:#ef4444">${formatINR(deductions)}</td>
        <td class="net-pay">${formatINR(net)}</td>
        <td>${emailDisplay}</td>
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
      </tr>`;
  }).join('');
  updateSelectionUI();
}

function toggleSelectAll(master) {
  const cbs = document.querySelectorAll('.emp-checkbox');
  cbs.forEach(cb => cb.checked = master.checked);
  updateSelectionUI();
}

function updateSelectionUI() {
  const cbs = document.querySelectorAll('.emp-checkbox');
  const checked = [...cbs].filter(cb => cb.checked);
  const btn = document.getElementById('delete-selected-btn');
  if (btn) {
    btn.style.display = checked.length > 0 ? 'inline-flex' : 'none';
    if (checked.length > 0) {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete ${checked.length}`;
    }
  }
}

async function deleteSelectedEmployees() {
  const checked = [...document.querySelectorAll('.emp-checkbox:checked')].map(cb => cb.value);
  if (checked.length === 0) return;
  if (!confirm(`Are you sure you want to delete ${checked.length} selected employees from the list?`)) return;
  
  allEmployees = allEmployees.filter(e => !checked.includes(e.id));
  try { localStorage.setItem('allEmployees', JSON.stringify(allEmployees)); } catch {}
  toast(`Removed ${checked.length} employees`, 'info');
  filterEmployees();
  if (currentPage === 'dashboard') loadDashboard();
}

function populateDeptFilter(selectId) {
  const depts = [...new Set(allEmployees.map(e => e.department || e.location).filter(Boolean))];
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">All Locations / Depts</option>` + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  sel.value = current;
}

// ─── Employee Modal ───────────────────────────────────────────────
function openEmployeeModal(id = null) {
  const modal = document.getElementById('employee-modal');
  modal.style.display = 'flex';
  const fields = [
    'id','name','pos','location','email','via',
    'present-days','paid-days','paid-leave','rh','bal-leaves','leave-bal','comments',
    'basic','earned','ot','payout','gross',
    'attendance-cuts','lwop','advance','total-deductions','net'
  ];
  fields.forEach(f => {
    const el = document.getElementById(`emp-${f}`);
    if (el) el.value = '';
  });
  document.getElementById('emp-edit-id').value = '';
  document.getElementById('modal-title').textContent = 'Add Employee';
  const viaEl = document.getElementById('emp-via');
  if (viaEl) viaEl.value = 'Bank';

  if (id) {
    const emp = allEmployees.find(e => e.id === id);
    if (!emp) return;
    document.getElementById('modal-title').textContent = 'Edit Employee';
    document.getElementById('emp-edit-id').value = emp.id;
    document.getElementById('emp-id').value = emp.id;
    document.getElementById('emp-name').value = emp.name || '';
    document.getElementById('emp-pos').value = emp.position || emp.designation || '';
    document.getElementById('emp-location').value = emp.location || '';
    document.getElementById('emp-email').value = emp.email || '';
    document.getElementById('emp-via').value = emp.via || 'Bank';

    document.getElementById('emp-present-days').value = emp.presentDays !== undefined ? emp.presentDays : '';
    document.getElementById('emp-paid-days').value = emp.paidDays !== undefined ? emp.paidDays : '';
    document.getElementById('emp-paid-leave').value = emp.paidLeave !== undefined ? emp.paidLeave : '';
    document.getElementById('emp-rh').value = emp.rh !== undefined ? emp.rh : (emp.restrictedHoliday !== undefined ? emp.restrictedHoliday : '');
    document.getElementById('emp-bal-leaves').value = emp.balanceLeaves !== undefined ? emp.balanceLeaves : '';
    document.getElementById('emp-leave-bal').value = emp.leaveBalance !== undefined ? emp.leaveBalance : '';
    document.getElementById('emp-comments').value = emp.comments || '';

    document.getElementById('emp-basic').value = emp.basic !== undefined ? emp.basic : '';
    document.getElementById('emp-earned').value = emp.earned !== undefined ? emp.earned : '';
    document.getElementById('emp-ot').value = emp.ot !== undefined ? emp.ot : '';
    document.getElementById('emp-payout').value = emp.payout !== undefined ? emp.payout : (emp.bonus !== undefined ? emp.bonus : '');
    document.getElementById('emp-gross').value = emp.gross !== undefined ? emp.gross : '';

    document.getElementById('emp-attendance-cuts').value = emp.attendanceCuts !== undefined ? emp.attendanceCuts : '';
    document.getElementById('emp-lwop').value = emp.lwop !== undefined ? emp.lwop : (emp.leaveCut !== undefined ? emp.leaveCut : '');
    document.getElementById('emp-advance').value = emp.advance !== undefined ? emp.advance : '';
    document.getElementById('emp-total-deductions').value = emp.totalDeductions !== undefined ? emp.totalDeductions : (emp.total !== undefined ? emp.total : '');
    document.getElementById('emp-net').value = emp.net !== undefined ? emp.net : '';
  }
}

function closeEmployeeModal() {
  document.getElementById('employee-modal').style.display = 'none';
}

async function saveEmployee() {
  const editId = document.getElementById('emp-edit-id').value;
  const id = document.getElementById('emp-id').value.trim();
  const name = document.getElementById('emp-name').value.trim();
  if (!name) { toast('Employee Name is required', 'error'); return; }

  const basic = parseFloat(document.getElementById('emp-basic').value || 0);
  const rawEarned = parseFloat(document.getElementById('emp-earned').value || 0);
  const earned = rawEarned > 0 ? rawEarned : basic;
  const ot = parseFloat(document.getElementById('emp-ot').value || 0);
  const payout = parseFloat(document.getElementById('emp-payout').value || 0);

  const rawGross = parseFloat(document.getElementById('emp-gross').value || 0);
  const gross = rawGross > 0 ? rawGross : (earned + ot + payout);

  const attendanceCuts = parseFloat(document.getElementById('emp-attendance-cuts').value || 0);
  const lwop = parseFloat(document.getElementById('emp-lwop').value || 0);
  const advance = parseFloat(document.getElementById('emp-advance').value || 0);
  const rawDeductions = parseFloat(document.getElementById('emp-total-deductions').value || 0);
  const totalDeductions = rawDeductions > 0 ? rawDeductions : (attendanceCuts + lwop + advance);

  const rawNet = parseFloat(document.getElementById('emp-net').value || 0);
  const net = rawNet > 0 ? rawNet : Math.max(0, gross - totalDeductions);

  const balanceLeaves = parseFloat(document.getElementById('emp-bal-leaves').value || 0);
  const paidLeave = parseFloat(document.getElementById('emp-paid-leave').value || 0);
  const leaveBalance = document.getElementById('emp-leave-bal').value !== '' 
    ? parseFloat(document.getElementById('emp-leave-bal').value) 
    : Math.max(0, balanceLeaves - paidLeave);

  const body = {
    id:                id || `EMP${String(allEmployees.length + 1).padStart(3, '0')}`,
    name,
    position:          document.getElementById('emp-pos').value.trim(),
    designation:       document.getElementById('emp-pos').value.trim(),
    location:          document.getElementById('emp-location').value.trim(),
    email:             document.getElementById('emp-email').value.trim(),
    via:               document.getElementById('emp-via').value.trim() || 'Bank',
    
    // Attendance
    presentDays:       parseFloat(document.getElementById('emp-present-days').value || 0),
    paidDays:          parseFloat(document.getElementById('emp-paid-days').value || 0),
    paidLeave,
    rh:                parseFloat(document.getElementById('emp-rh').value || 0),
    restrictedHoliday: parseFloat(document.getElementById('emp-rh').value || 0),
    balanceLeaves,
    leaveBalance,
    comments:          document.getElementById('emp-comments').value.trim(),

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
    net
  };

  if (editId) {
    const idx = allEmployees.findIndex(e => e.id === editId);
    if (idx >= 0) allEmployees[idx] = { ...allEmployees[idx], ...body };
  } else {
    allEmployees.push(body);
  }
  try { localStorage.setItem('allEmployees', JSON.stringify(allEmployees)); } catch {}
  
  toast(editId ? 'Employee updated!' : 'Employee added!', 'success');
  closeEmployeeModal();
  filterEmployees();
  if (currentPage === 'dashboard') loadDashboard();
}

// ─── Paste Modal ──────────────────────────────────────────────────
function openPasteModal() {
  document.getElementById('paste-modal').style.display = 'flex';
  document.getElementById('paste-text-input').value = '';
  document.getElementById('paste-text-input').focus();
}

function closePasteModal() {
  document.getElementById('paste-modal').style.display = 'none';
}

async function importPastedData() {
  const text = document.getElementById('paste-text-input').value.trim();
  if (!text) { toast('Please paste your spreadsheet data', 'error'); return; }

  toast('Processing pasted data…', 'info');
  try {
    const res = await fetch('/api/employees/import-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.success && data.employees?.length > 0) {
      allEmployees = data.employees;
      try { localStorage.setItem('allEmployees', JSON.stringify(allEmployees)); } catch {}
      closePasteModal();
      toast(`✅ Loaded ${allEmployees.length} employees from pasted data!`, 'success');
      renderEmployeesTable();
      if (currentPage === 'dashboard') loadDashboard();
    } else {
      toast('❌ Failed: ' + (data.error || 'No employee rows found. Check column headers.'), 'error');
    }
  } catch (err) {
    toast('Error importing pasted data: ' + err.message, 'error');
  }
}

async function deleteEmployee(id) {
  if (!confirm('Remove this employee from the list?')) return;
  allEmployees = allEmployees.filter(e => e.id !== id);
  try { localStorage.setItem('allEmployees', JSON.stringify(allEmployees)); } catch {}
  toast('Employee removed', 'info');
  filterEmployees();
  if (currentPage === 'dashboard') loadDashboard();
}

function triggerCSVImport() { document.getElementById('csv-file-input').click(); }

async function importCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('csv', file);
  toast('Processing CSV…', 'info');
  const res = await fetch('/api/employees/import', { method: 'POST', body: formData });
  const data = await res.json();
  if (data.success) {
    allEmployees = data.employees; // Store globally in-memory
    try { localStorage.setItem('allEmployees', JSON.stringify(allEmployees)); } catch {}
    toast(`✅ Loaded ${allEmployees.length} employees from CSV. You can now cross-check and send.`, 'success');
    renderEmployeesTable();
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
  const month = emp.month || document.getElementById('salary-month')?.value || new Date().toLocaleString('en-IN', { month: 'long' });
  const year  = emp.year  || document.getElementById('salary-year')?.value  || new Date().getFullYear();
  
  toast('Generating PDF preview…', 'info');
  try {
    const res = await fetch('/api/mail/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee: emp, month, year })
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
      <div><div class="stat-value">${formatINR(totalNet)}</div><div class="stat-label">Total Net Salary</div></div>
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

  let empsToSend = [];

  if (target === 'all') {
    empsToSend = allEmployees;
  } else if (target === 'department') {
    const department = document.getElementById('compose-dept').value;
    empsToSend = department === 'all' ? allEmployees : allEmployees.filter(e => e.department === department);
  } else {
    const selectedIds = [...document.querySelectorAll('#employee-checklist input:checked')].map(i => i.value);
    empsToSend = allEmployees.filter(e => selectedIds.includes(e.id));
  }

  const total = empsToSend.length;
  if (total === 0) { toast('No recipients selected', 'error'); return; }

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
      body: JSON.stringify({ employees: empsToSend, month, year, subject, bodyTemplate })
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
