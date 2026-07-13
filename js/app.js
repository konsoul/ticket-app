/**
 * app.js - Main UI controller for Field Service Ticketing App.
 * Manages event handlers, rendering lists, modals, live timers, and backup features.
 */

// Global State

// Timesheet State
let todayTimesheet = null;
let allTimesheets = [];
let editingTimesheet = null;

// DOM Elements
const elements = {
  hourlyWageInput: document.getElementById('hourlyWageInput'),
  logoutBtn: document.getElementById('logoutBtn'),
    viewCurrentTab: document.getElementById('viewCurrentTab'),
  viewHistoryTab: document.getElementById('viewHistoryTab'),
  tsViewTitle: document.getElementById('tsViewTitle'),
  tsActionButtons: document.getElementById('tsActionButtons'),
  tsCurrentWeekList: document.getElementById('tsCurrentWeekList'),
  tsHistoryList: document.getElementById('tsHistoryList'),
  tsPrintBtn: document.getElementById('tsPrintBtn'),
  tsAddManualBtn: document.getElementById('tsAddManualBtn'),
  tsAutoFillBtn: document.getElementById('tsAutoFillBtn'),
  tsSaveWeekBtn: document.getElementById('tsSaveWeekBtn'),
  
  // Edit Timesheet Modal
  editTimesheetModal: document.getElementById('editTimesheetModal'),
  editTimesheetForm: document.getElementById('editTimesheetForm'),
  editTsId: document.getElementById('editTsId'),
  editTsDate: document.getElementById('editTsDate'),
  editTsClockIn: document.getElementById('editTsClockIn'),
  editTsLunchDuration: document.getElementById('editTsLunchDuration'),
  editTsClockOut: document.getElementById('editTsClockOut'),
  editTsNotes: document.getElementById('editTsNotes'),
  editTsDeleteBtn: document.getElementById('editTsDeleteBtn'),

  // Print Settings Modal & Container
  printOptionsModal: document.getElementById('printOptionsModal'),
  printOptionsForm: document.getElementById('printOptionsForm'),
  optEmpName: document.getElementById('optEmpName'),
  optDept: document.getElementById('optDept'),
  optSupervisor: document.getElementById('optSupervisor'),
  optWeekEnding: document.getElementById('optWeekEnding'),
  
  printContainer: document.getElementById('printContainer'),
  printEmpName: document.getElementById('printEmpName'),
  printWeekEnding: document.getElementById('printWeekEnding'),
  printSupervisor: document.getElementById('printSupervisor'),
  printTableBody: document.getElementById('printTableBody'),
  printTotalHours: document.getElementById('printTotalHours'),

  // Auth Elements
  authModal: document.getElementById('authModal'),
  authForm: document.getElementById('authForm'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authErrorMsg: document.getElementById('authErrorMsg')
};

let isAppInitialized = false;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners(); // Attach UI events

  window.AppDB.onAuthStateChanged(async (user) => {
    if (user) {
      if (elements.authModal) closeAllModals();
      if (elements.logoutBtn) elements.logoutBtn.style.display = 'inline-flex';
      
      if (!isAppInitialized) {
        isAppInitialized = true;
        try {
          await refreshTimesheet();
        } catch (error) {
          console.error('Failed to initialize App:', error);
          alert('Error loading data. Please refresh.');
        }
      } else {
        await refreshTimesheet();
      }
    } else {
      isAppInitialized = false;
      if (elements.logoutBtn) elements.logoutBtn.style.display = 'none';
      if (elements.authModal) openModal(elements.authModal);
    }
  });
});

// Setup Events
function setupEventListeners() {
  // Auth Form Submission
  if (elements.authForm) {
    elements.authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      elements.authErrorMsg.style.display = 'none';
      const email = elements.authEmail.value.trim();
      const password = elements.authPassword.value;
      const btn = document.getElementById('authSubmitBtn');
      const originalText = btn.textContent;
      btn.textContent = 'Loading...';
      btn.disabled = true;
      try {
        await window.AppDB.login(email, password);
      } catch (err) {
        elements.authErrorMsg.textContent = err.message;
        elements.authErrorMsg.style.display = 'block';
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }

  // Logout Button
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', async () => {
      await window.AppDB.logout();
    });
  }

  // Modal toggle close buttons
  document.querySelectorAll('.modal-close-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

  // Hourly Wage persistence
  if (elements.hourlyWageInput) {
    elements.hourlyWageInput.value = localStorage.getItem('ts_hourly_wage') || '0';
    elements.hourlyWageInput.addEventListener('input', () => {
      localStorage.setItem('ts_hourly_wage', elements.hourlyWageInput.value);
      renderTimesheetHistory();
    });
  }

  

    // Navigation Tabs
  if (elements.viewCurrentTab) {
    elements.viewCurrentTab.addEventListener('click', () => switchView('current'));
  }
  if (elements.viewHistoryTab) {
    elements.viewHistoryTab.addEventListener('click', () => switchView('history'));
  }

  // Handle Delete Timesheet Entry
  elements.editTsDeleteBtn.addEventListener('click', async () => {
    if (!editingTimesheet || !editingTimesheet.id) return;
    
    if (confirm('Are you sure you want to delete this timesheet entry? This action cannot be undone.')) {
      try {
        await window.AppDB.deleteTimesheet(editingTimesheet.id);
        closeAllModals();
        await refreshTimesheet();
      } catch (err) {
        console.error('Failed to delete timesheet:', err);
        alert('Error deleting timesheet.');
      }
    }
  });

  // Submit Edit Timesheet Entry Form
  elements.editTimesheetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingTimesheet) return;

    const dateStr = elements.editTsDate.value;
    const inTimeStr = elements.editTsClockIn.value; // "HH:MM"
    const outTimeStr = elements.editTsClockOut.value; // "HH:MM" or ""
    const lunchMins = parseInt(elements.editTsLunchDuration.value, 10);
    const notesStr = elements.editTsNotes.value.trim();

    editingTimesheet.date = dateStr;
    editingTimesheet.clockIn = new Date(`${dateStr}T${inTimeStr}`).getTime();
    
    if (outTimeStr) {
      editingTimesheet.clockOut = new Date(`${dateStr}T${outTimeStr}`).getTime();
    } else {
      editingTimesheet.clockOut = null;
    }

    editingTimesheet.lunchDuration = isNaN(lunchMins) ? 0 : Math.max(0, lunchMins);
    editingTimesheet.notes = notesStr;

    try {
      if (editingTimesheet.id) {
        await window.AppDB.updateTimesheet(editingTimesheet);
      } else {
        // Check if an entry for this date already exists
        const existing = await window.AppDB.getTimesheetByDate(dateStr);
        if (existing) {
          alert(`An entry for ${dateStr} already exists. Please edit the existing entry.`);
          return;
        }
        await window.AppDB.createTimesheet(editingTimesheet);
      }
      closeAllModals();
      await refreshTimesheet();
    } catch (err) {
      console.error('Failed to update timesheet:', err);
      alert('Error updating timesheet log: ' + err.message);
    }
  });

  // Open Add Manual Entry Modal
  elements.tsAddManualBtn.addEventListener('click', () => {
    openNewTimesheetModal();
  });

  // Auto-fill Monday to Friday
  if (elements.tsAutoFillBtn) {
    elements.tsAutoFillBtn.addEventListener('click', async () => {
      if (confirm('Auto-fill missing Monday-Friday timesheets?')) {
        await autoFillCurrentWeek();
      }
    });
  }

  // Handle Save Week button
  if (elements.tsSaveWeekBtn) {
    elements.tsSaveWeekBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to save the current week and move it to your History?')) {
        await saveCurrentWeek();
      }
    });
  }

  // Open Print Options Modal
  elements.tsPrintBtn.addEventListener('click', () => {
    console.time('PrintMenuLoad');
    console.log('[Print] Opening Print Weekly menu...');
    
    // Populate stored defaults
    elements.optEmpName.value = localStorage.getItem('ts_print_emp_name') || 'Brad Rappa';
    elements.optDept.value = localStorage.getItem('ts_print_dept') || 'Field Service';
    elements.optSupervisor.value = localStorage.getItem('ts_print_supervisor') || '';
    
    // Set week ending default to next Saturday
    const nextSaturday = getThisSaturdaysDate();
    const year = nextSaturday.getFullYear();
    const month = String(nextSaturday.getMonth() + 1).padStart(2, '0');
    const day = String(nextSaturday.getDate()).padStart(2, '0');
    elements.optWeekEnding.value = `${year}-${month}-${day}`;
    
    openModal(elements.printOptionsModal);
    console.timeEnd('PrintMenuLoad');
  });

  // Handle Print Form Submission
  elements.printOptionsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    console.time('GeneratePrintout');
    console.log('[Print] Generate Printout button clicked...');
    
    const empName = elements.optEmpName.value.trim();
    const dept = elements.optDept.value.trim();
    const supervisor = elements.optSupervisor.value.trim();
    const weekEndingStr = elements.optWeekEnding.value; // YYYY-MM-DD
    
    // Save to localStorage as defaults
    localStorage.setItem('ts_print_emp_name', empName);
    localStorage.setItem('ts_print_dept', dept);
    localStorage.setItem('ts_print_supervisor', supervisor);
    
    generateAndPrintTimesheet(empName, dept, supervisor, weekEndingStr);
    console.timeEnd('GeneratePrintout');
  });
}

// Modal Helpers
function openModal(modal) {
  modal.classList.add('active');
}

function closeAllModals() {
  elements.editTimesheetModal.classList.remove('active');
  elements.printOptionsModal.classList.remove('active');
  if (elements.authModal) elements.authModal.classList.remove('active');
  editingTimesheet = null;
}

// --- TIMESHEETS LOGIC & RENDERING ---

function switchView(viewName) {
  if (viewName === 'current') {
    elements.viewCurrentTab.classList.add('active');
    elements.viewHistoryTab.classList.remove('active');
    elements.tsCurrentWeekList.style.display = 'block';
    elements.tsHistoryList.style.display = 'none';
    elements.tsViewTitle.textContent = 'Current Week';
    if (elements.tsActionButtons) elements.tsActionButtons.style.display = 'flex';
  } else {
    elements.viewCurrentTab.classList.remove('active');
    elements.viewHistoryTab.classList.add('active');
    elements.tsCurrentWeekList.style.display = 'none';
    elements.tsHistoryList.style.display = 'block';
    elements.tsViewTitle.textContent = 'Income History';
    if (elements.tsActionButtons) elements.tsActionButtons.style.display = 'none';
  }
}

async function refreshTimesheet() {
  const dateStr = getLocalDateStr();

  // Fetch today's entry
  todayTimesheet = await window.AppDB.getTimesheetByDate(dateStr);
  allTimesheets = await window.AppDB.getAllTimesheets();
  
  renderTimesheetHistory();
}

// Render historical timesheet rows
function renderTimesheetHistory() {
  elements.tsCurrentWeekList.innerHTML = '';
  elements.tsHistoryList.innerHTML = '';
  
  const wageRate = elements.hourlyWageInput ? (parseFloat(elements.hourlyWageInput.value) || 0) : 0;

  if (allTimesheets.length === 0) {
    elements.tsCurrentWeekList.innerHTML = '<div style="color: hsl(var(--text-muted)); font-size: 13px; text-align: center; padding: 24px 0;">No timesheets logged for this week.</div>';
    elements.tsHistoryList.innerHTML = '<div style="color: hsl(var(--text-muted)); font-size: 13px; text-align: center; padding: 24px 0;">No timesheet history found.</div>';
    return;
  }

  const currentWeeksMap = new Map();
  const historyWeeksMap = new Map();
  let grandTotalMins = 0;
  const currentWeekMondayStr = getMondayForDateStr(getLocalDateStr());

  allTimesheets.forEach(ts => {
    const mondayStr = getMondayForDateStr(ts.date);
    
    // Determine if this entry is archived:
    // - Explicitly archived entries are always history
    // - Legacy entries (missing isArchived) from past calendar weeks default to history
    // - Only entries with isArchived explicitly false, or legacy entries from the current calendar week, stay in current
    const isArchived = ts.isArchived === true || (ts.isArchived === undefined && mondayStr !== currentWeekMondayStr);
    const mapToUse = isArchived ? historyWeeksMap : currentWeeksMap;
    
    // Only archived entries count toward the All-Time Income History total
    if (isArchived) {
      grandTotalMins += calculateTimesheetMinutes(ts);
    }
    if (!mapToUse.has(mondayStr)) {
      mapToUse.set(mondayStr, {
        mondayStr,
        entries: [],
        totalMinutes: 0
      });
    }
    const week = mapToUse.get(mondayStr);
    week.entries.push(ts);
    week.totalMinutes += calculateTimesheetMinutes(ts);
  });

  // Calculate and Render Grand Total for All Time
  const grandTotalHrs = (grandTotalMins / 60).toFixed(2);
  let grandEarningsText = '';
  if (wageRate > 0) {
    const gross = (grandTotalMins / 60) * wageRate;
    const net = gross * (1 - 0.156);
    grandEarningsText = `<br><span style="color: var(--primary-color); font-size: 13px; font-weight: 600;">Gross: $${gross.toFixed(2)} | Net: $${net.toFixed(2)}</span>`;
  }
  
  const grandTotalHeader = document.createElement('div');
  grandTotalHeader.className = 'grand-total-header';
  grandTotalHeader.style.cssText = 'background: rgba(139, 92, 246, 0.1); padding: 16px; border-radius: var(--radius-md); margin-bottom: 20px; text-align: center; border: 1px solid rgba(139, 92, 246, 0.2);';
  grandTotalHeader.innerHTML = `
    <h3 style="margin: 0 0 8px 0; font-size: 16px; color: var(--text-color);">All-Time History</h3>
    <div style="font-size: 15px; color: var(--text-muted);">Total Hours: <span style="color: var(--text-color); font-weight: bold;">${grandTotalHrs} hrs</span>${grandEarningsText}</div>
  `;
  elements.tsHistoryList.appendChild(grandTotalHeader);

  // Helper to render week entries into a container
  const renderWeekInto = (week, targetContainer, isHistoryTab) => {
    const weekHeader = document.createElement('div');
    weekHeader.className = 'week-group-header';
    
    const mon = new Date(week.mondayStr + 'T00:00:00');
    const sun = new Date(mon.getTime() + 6 * 24 * 60 * 60 * 1000);
    const dateOptions = { month: 'short', day: 'numeric' };
    const dateRangeStr = `${mon.toLocaleDateString(undefined, dateOptions)} - ${sun.toLocaleDateString(undefined, dateOptions)}, ${mon.getFullYear()}`;
    
    const weeklyHours = (week.totalMinutes / 60).toFixed(1);
    let earningsText = '';
    if (wageRate > 0) {
      const grossEarnings = (week.totalMinutes / 60) * wageRate;
      const netEarnings = grossEarnings * (1 - 0.156);
      earningsText = ` | Gross: $${grossEarnings.toFixed(2)} | Net: $${netEarnings.toFixed(2)}`;
    }

    weekHeader.innerHTML = `
      <div style="display: flex; align-items: center;">
        <h4>Week of ${dateRangeStr}</h4>
        ${isHistoryTab ? '<svg class="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="week-totals" style="margin: 0;">Total: ${weeklyHours} hrs${earningsText}</div>
        ${isHistoryTab ? `<button class="history-print-btn btn btn-secondary" style="padding: 4px 8px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;" title="Print this week" aria-label="Print this week">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print
        </button>` : ''}
      </div>
    `;
    
    // Wire up the print button on history headers
    if (isHistoryTab) {
      const printBtn = weekHeader.querySelector('.history-print-btn');
      if (printBtn) {
        printBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sat = new Date(mon.getTime() + 5 * 24 * 60 * 60 * 1000);
          const satYear = sat.getFullYear();
          const satMonth = String(sat.getMonth() + 1).padStart(2, '0');
          const satDay = String(sat.getDate()).padStart(2, '0');
          
          elements.optEmpName.value = localStorage.getItem('ts_print_emp_name') || 'Brad Rappa';
          elements.optDept.value = localStorage.getItem('ts_print_dept') || 'Field Service';
          elements.optSupervisor.value = localStorage.getItem('ts_print_supervisor') || '';
          elements.optWeekEnding.value = `${satYear}-${satMonth}-${satDay}`;
          
          openModal(elements.printOptionsModal);
        });
      }
    }

    targetContainer.appendChild(weekHeader);

    const weekContent = document.createElement('div');
    weekContent.className = 'week-group-content';
    
    if (isHistoryTab) {
      weekContent.classList.add('collapsed');
      weekHeader.classList.add('collapsed');
      
      weekHeader.addEventListener('click', () => {
        weekContent.classList.toggle('collapsed');
        weekHeader.classList.toggle('collapsed');
      });
    }

    targetContainer.appendChild(weekContent);

    week.entries.forEach(ts => {
      const itemDate = new Date(ts.date + 'T00:00:00');
      
      const card = document.createElement('div');
      card.className = 'history-item fade-in';

      const cleanDateFormatted = itemDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      });

      const displayClockIn = ts.clockIn ? formatTime(new Date(ts.clockIn)) : '--:--';
      const displayClockOut = ts.clockOut ? formatTime(new Date(ts.clockOut)) : 'Working';
      const totalMins = calculateTimesheetMinutes(ts);
      const decimalHrs = (totalMins / 60).toFixed(2);

      let dailyEarningsText = '';
      if (wageRate > 0) {
        const grossEarnings = (totalMins / 60) * wageRate;
        const netEarnings = grossEarnings * (1 - 0.156);
        dailyEarningsText = ` <span style="color: var(--primary-color); font-size: 11px; margin-top: 4px; display: block; font-weight: 600;">Gross: $${grossEarnings.toFixed(2)} | Net: $${netEarnings.toFixed(2)}</span>`;
      }

      card.innerHTML = `
        <div class="history-left">
          <div class="history-date">${cleanDateFormatted}</div>
          <div class="history-times">${displayClockIn} - ${displayClockOut} | Lunch: ${ts.lunchDuration}m</div>
          ${ts.notes ? `<div class="history-notes" title="${escapeHTML(ts.notes)}">${escapeHTML(ts.notes)}</div>` : ''}
        </div>
        <div class="history-right" style="display: flex; align-items: center; gap: 12px; text-align: right;">
          <div>
            <div class="history-hours">${decimalHrs} hrs</div>
            ${dailyEarningsText}
          </div>
          <button class="history-edit-btn" data-ts-id="${ts.id}" aria-label="Edit timesheet entry">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
        </div>
      `;

      card.querySelector('.history-edit-btn').addEventListener('click', () => {
        openEditTimesheetModal(ts);
      });

      weekContent.appendChild(card);
    });
  };

  // Render current week(s) - flat, no month grouping needed
  Array.from(currentWeeksMap.values()).forEach(week => {
    renderWeekInto(week, elements.tsCurrentWeekList, false);
  });

  // Render history grouped by month
  // First, group the history weeks by month (YYYY-MM based on the Monday of each week)
  const monthsMap = new Map(); // key: "YYYY-MM", value: { monthKey, label, weeks: [], totalMinutes }
  
  Array.from(historyWeeksMap.values()).forEach(week => {
    // Use the first entry's date to determine the month this week belongs to
    // (use the Monday date of the week for consistency)
    const monDate = new Date(week.mondayStr + 'T00:00:00');
    const monthKey = `${monDate.getFullYear()}-${String(monDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthsMap.has(monthKey)) {
      const label = monDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      monthsMap.set(monthKey, {
        monthKey,
        label,
        weeks: [],
        totalMinutes: 0
      });
    }
    const month = monthsMap.get(monthKey);
    month.weeks.push(week);
    month.totalMinutes += week.totalMinutes;
  });

  // Sort months descending (newest first)
  const sortedMonths = Array.from(monthsMap.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  sortedMonths.forEach(month => {
    // Render month header
    const monthHeader = document.createElement('div');
    monthHeader.className = 'month-group-header';
    
    const monthHrs = (month.totalMinutes / 60).toFixed(1);
    let monthEarningsText = '';
    if (wageRate > 0) {
      const monthGross = (month.totalMinutes / 60) * wageRate;
      const monthNet = monthGross * (1 - 0.156);
      monthEarningsText = `<br>Gross: $${monthGross.toFixed(2)} | Net: $${monthNet.toFixed(2)}`;
    }

    monthHeader.innerHTML = `
      <div style="display: flex; align-items: center;">
        <h3>${month.label}</h3>
        <svg class="chevron-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="month-totals">${monthHrs} hrs${monthEarningsText}</div>
    `;

    elements.tsHistoryList.appendChild(monthHeader);

    // Month content container (holds all weeks for this month)
    const monthContent = document.createElement('div');
    monthContent.className = 'month-group-content collapsed';
    monthHeader.classList.add('collapsed');

    monthHeader.addEventListener('click', () => {
      monthContent.classList.toggle('collapsed');
      monthHeader.classList.toggle('collapsed');
    });

    elements.tsHistoryList.appendChild(monthContent);

    // Render each week inside this month's content
    month.weeks.forEach(week => {
      renderWeekInto(week, monthContent, true);
    });
  });

  if (elements.tsCurrentWeekList.innerHTML === '') {
    elements.tsCurrentWeekList.innerHTML = '<div style="color: hsl(var(--text-muted)); font-size: 13px; text-align: center; padding: 24px 0;">No timesheets logged for this week.</div>';
  }
  const isOnlyHeader = elements.tsHistoryList.children.length === 1 && elements.tsHistoryList.children[0].className === 'grand-total-header';
  if (isOnlyHeader) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.cssText = 'color: hsl(var(--text-muted)); font-size: 13px; text-align: center; padding: 24px 0;';
    emptyMsg.textContent = 'No timesheet history found.';
    elements.tsHistoryList.appendChild(emptyMsg);
  }
}

// Open modal for updating timesheet details
function openEditTimesheetModal(ts) {
  editingTimesheet = { ...ts };
  
  elements.editTsId.value = editingTimesheet.id;
  elements.editTsDate.value = editingTimesheet.date;
  elements.editTsClockIn.value = editingTimesheet.clockIn ? formatTimeInput(new Date(editingTimesheet.clockIn)) : '08:00';
  elements.editTsLunchDuration.value = editingTimesheet.lunchDuration;
  elements.editTsClockOut.value = editingTimesheet.clockOut ? formatTimeInput(new Date(editingTimesheet.clockOut)) : '';
  elements.editTsNotes.value = editingTimesheet.notes || '';
  
  elements.editTsDeleteBtn.style.display = 'block';
  openModal(elements.editTimesheetModal);
}

// Open modal for creating a manual timesheet entry
function openNewTimesheetModal() {
  editingTimesheet = {}; // Empty indicates new
  
  elements.editTsId.value = '';
  elements.editTsDate.value = getLocalDateStr();
  elements.editTsClockIn.value = '08:00';
  elements.editTsLunchDuration.value = 30;
  elements.editTsClockOut.value = '';
  elements.editTsNotes.value = '';
  
  elements.editTsDeleteBtn.style.display = 'none';
  openModal(elements.editTimesheetModal);
}

// --- HELPER UTILITIES ---

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
// Get local date string YYYY-MM-DD
function getLocalDateStr(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format Date object to HH:MM AM/PM standard
function formatTime(dateObj) {
  return dateObj.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Format Date object to "HH:MM" 24-hour style for inputs
function formatTimeInput(dateObj) {
  const hrs = String(dateObj.getHours()).padStart(2, '0');
  const mins = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hrs}:${mins}`;
}

// Calculate Net timesheet minutes
function calculateTimesheetMinutes(ts) {
  if (!ts.clockIn) return 0;
  const endTimestamp = ts.clockOut || Date.now();
  const rawMins = Math.floor((endTimestamp - ts.clockIn) / 60000);
  return Math.max(0, rawMins - ts.lunchDuration);
}

// Get the Monday date string for a given date string (YYYY-MM-DD)
function getMondayForDateStr(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dateDay = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${dateDay}`;
}

// Get the Monday of this week (for weekly calculations)
function getThisMondaysDate() {
  const today = new Date();
  today.setHours(0,0,0,0);
  const day = today.getDay();
  // Adjust so Monday is day 1, Sunday is day 7
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(today.setDate(diff));
}

// Get the Sunday of this week (for Week Ending Date default)
function getThisSaturdaysDate() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const day = today.getDay();
  // Adjust so Saturday is day 6, if today is Sunday (0), next Saturday is in 6 days
  const diff = today.getDate() + (day === 6 ? 0 : 6 - day);
  return new Date(today.setDate(diff));
}

// Generate the printable timesheet HTML and trigger print dialog
function generateAndPrintTimesheet(empName, dept, supervisor, weekEndingStr) {
  // Parse Week Ending Date robustly using local components
  const [y, m, d] = weekEndingStr.split('-').map(Number);
  const weekEndDate = new Date(y, m - 1, d); // Midnight local time
  
  // Start date of week is 6 days prior (Sunday)
  const weekStartDate = new Date(y, m - 1, d - 6);
  
  // Format Date Range bounds
  const formatYMD = (dateObj) => {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const weekStartStr = formatYMD(weekStartDate);
  const weekEndStr = formatYMD(weekEndDate);
  
  // Populating static fields
  elements.printEmpName.textContent = empName;
  elements.printSupervisor.textContent = supervisor || '--';
  elements.printWeekEnding.textContent = weekEndDate.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  // Populate Rows for all 7 days of the week (Sunday to Saturday)
  elements.printTableBody.innerHTML = '';
  let totalWeeklyMins = 0;
  
  for (let i = 0; i < 7; i++) {
    const currentDate = new Date(weekStartDate.getTime() + i * 24 * 60 * 60 * 1000);
    const dateYMD = formatYMD(currentDate);
    
    // Find timesheet record for this date
    const record = allTimesheets.find(ts => ts.date === dateYMD);
    
    const formattedDate = currentDate.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' }).replace(',', '');
    const formattedDay = currentDate.toLocaleDateString(undefined, { weekday: 'long' });
    
    let clockIn = '';
    let mealBreakFormatted = '';
    let clockOut = '';
    let netHoursDecimal = '';
    let notes = '';
    
    if (record) {
      clockIn = record.clockIn ? formatTime(new Date(record.clockIn)) : '';
      
      if (record.lunchStart) {
        mealBreakFormatted = 'On Break';
      } else if (record.lunchDuration > 0) {
        // Format to decimal hours for the scan
        const mealDecimal = (record.lunchDuration / 60).toFixed(1);
        mealBreakFormatted = mealDecimal === '0.5' ? '.5' : mealDecimal;
      }
      
      clockOut = record.clockOut ? formatTime(new Date(record.clockOut)) : '';
      
      const dayMins = calculateTimesheetMinutes(record);
      totalWeeklyMins += dayMins;
      netHoursDecimal = dayMins > 0 ? (dayMins / 60).toFixed(2) : '';
      notes = record.notes || '';
    }
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="border: 1px solid #000; padding: 6px; text-align: left; text-transform: uppercase;">${formattedDay}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${formattedDate}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${clockIn}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${clockOut}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${mealBreakFormatted}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: center; font-weight: bold;">${netHoursDecimal}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: left; font-size: 9pt;">${escapeHTML(notes)}</td>
    `;
    elements.printTableBody.appendChild(row);
  }
  
  // Set Total hours
  const totalWeeklyHrs = (totalWeeklyMins / 60).toFixed(2);
  elements.printTotalHours.textContent = totalWeeklyHrs;
  
  // Close Options Modal
  closeAllModals();
  
  // Trigger ultra-fast iframe printing (bypasses Safari massive DOM print layout bugs)
  setTimeout(() => {
    let printFrame = document.getElementById('print-iframe');
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'print-iframe';
      // Beta 3 Stealth Styles: Browser thinks it's visible, but it's invisible to the user
      printFrame.style.position = 'fixed';
      printFrame.style.right = '0';
      printFrame.style.bottom = '0';
      printFrame.style.width = '1px';
      printFrame.style.height = '1px';
      printFrame.style.opacity = '0.01';
      printFrame.style.pointerEvents = 'none';
      printFrame.style.border = 'none';
      printFrame.style.zIndex = '-1';
      document.body.appendChild(printFrame);
    }
    
    const doc = printFrame.contentWindow.document;
    const printContent = document.getElementById('printContainer').innerHTML;
    const baseUrl = window.location.href.split('?')[0].replace('index.html', '');
    
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Timesheet</title>
          <base href="${baseUrl}">
          <style>
            @page { size: letter; margin: 12mm 15mm 12mm 15mm; }
            body { 
              font-family: 'Times New Roman', Times, serif; 
              font-size: 11pt; 
              color: #000; 
              margin: 0; 
              padding: 0;
              background: #fff;
            }
            * { box-sizing: border-box; }
            .print-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 10pt; }
            .print-table th, .print-table td { border: 1px solid #000; padding: 6px; }
          </style>
        </head>
        <body>
          <div style="transform: scale(0.85); transform-origin: top left; width: 117.64%;">
            ${printContent}
          </div>
        </body>
      </html>
    `);
    doc.close();
    
    // Give iframe a moment to render image, then print
    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    }, 150);
  }, 50);
}

// Auto-fill missing Monday-Friday entries for the active week
async function autoFillCurrentWeek() {
  // Determine which week to start. Default to current calendar week.
  let monday = getThisMondaysDate();
  
  // Find the latest week among all timesheets
  if (allTimesheets.length > 0) {
    let latestTsTime = 0;
    allTimesheets.forEach(ts => {
      const tsMondayTime = new Date(getMondayForDateStr(ts.date) + 'T00:00:00').getTime();
      if (tsMondayTime > latestTsTime) {
        latestTsTime = tsMondayTime;
      }
    });
    
    const latestMondayStr = getLocalDateStr(new Date(latestTsTime));
    const hasUnarchivedLatest = allTimesheets.some(ts => getMondayForDateStr(ts.date) === latestMondayStr && !ts.isArchived);
    const hasArchivedLatest = allTimesheets.some(ts => getMondayForDateStr(ts.date) === latestMondayStr && ts.isArchived);
    
    let targetMondayTime = monday.getTime();
    if (latestTsTime >= monday.getTime()) {
      if (hasArchivedLatest && !hasUnarchivedLatest) {
         // The latest week is fully archived, so we should generate the NEXT week
         targetMondayTime = latestTsTime + 7 * 24 * 60 * 60 * 1000;
      } else {
         targetMondayTime = latestTsTime;
      }
    }
    monday = new Date(targetMondayTime);
  }

  let addedCount = 0;
  for (let i = 0; i < 5; i++) { // Mon = 0, Tue = 1, Wed = 2, Thu = 3, Fri = 4
    const d = new Date(monday.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    // Check if entry already exists
    const existing = await window.AppDB.getTimesheetByDate(dateStr);
    if (!existing) {
      const clockInMs = new Date(`${dateStr}T08:00:00`).getTime();
      const clockOutMs = new Date(`${dateStr}T16:30:00`).getTime();
      
      const newTs = {
        date: dateStr,
        clockIn: clockInMs,
        clockOut: clockOutMs,
        lunchDuration: 30,
        notes: '',
        isArchived: false
      };
      await window.AppDB.createTimesheet(newTs);
      addedCount++;
    }
  }
  
  if (addedCount > 0) {
    alert(`Successfully generated ${addedCount} day(s) for the week of ${getLocalDateStr(monday)}.`);
    await refreshTimesheet();
  } else {
    alert(`All Monday-Friday days for the week of ${getLocalDateStr(monday)} already have entries.`);
  }
}

async function saveCurrentWeek() {
  // Find all unarchived entries
  const unarchived = allTimesheets.filter(ts => !ts.isArchived);
  if (unarchived.length === 0) {
    alert('No active timesheets to save.');
    return;
  }
  
  let savedCount = 0;
  for (const ts of unarchived) {
    ts.isArchived = true;
    await window.AppDB.updateTimesheet(ts);
    savedCount++;
  }
  
  alert(`Successfully saved ${savedCount} timesheets to History.`);
  await refreshTimesheet();
}

