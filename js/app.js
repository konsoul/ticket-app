/**
 * app.js - Main UI controller for Field Service Ticketing App.
 * Manages event handlers, rendering lists, modals, live timers, and backup features.
 */

// Global State
let currentFilter = 'all';
let searchQuery = '';
let selectedTicket = null;
let activeTimerInterval = null;

// Timesheet State
let currentView = 'tickets'; // 'tickets' or 'timesheet'
let todayTimesheet = null;
let timesheetTimerInterval = null;
let allTimesheets = [];
let editingTimesheet = null;

// DOM Elements
const elements = {
  ticketList: document.getElementById('ticketList'),
  searchInput: document.getElementById('searchInput'),
  filterTabs: document.querySelectorAll('.filter-tab'),
  newTicketFab: document.getElementById('newTicketFab'),
  newTicketModal: document.getElementById('newTicketModal'),
  newTicketForm: document.getElementById('newTicketForm'),
  detailModal: document.getElementById('detailModal'),
  saveDetailBtn: document.getElementById('saveDetailBtn'),
  deleteTicketBtn: document.getElementById('deleteTicketBtn'),
  
  // New Ticket Form fields
  newClientName: document.getElementById('newClientName'),
  newClientContact: document.getElementById('newClientContact'),
  newWorkDescription: document.getElementById('newWorkDescription'),
  
  // Detail Modal fields
  detailClientName: document.getElementById('detailClientName'),
  detailClientContactText: document.getElementById('detailClientContactText'),
  detailWorkDesc: document.getElementById('detailWorkDesc'),
  statusToggleBtns: document.querySelectorAll('.status-toggle-btn'),
  
  // Timer Elements
  timerDisplay: document.getElementById('timerDisplay'),
  totalMinutesDisplay: document.getElementById('totalMinutesDisplay'),
  toggleTimerBtn: document.getElementById('toggleTimerBtn'),
  addManualTimeBtn: document.getElementById('addManualTimeBtn'),
  quickTimeButtons: document.querySelectorAll('.quick-time-btn'),
  
  // Notes
  addNoteForm: document.getElementById('addNoteForm'),
  newNoteText: document.getElementById('newNoteText'),
  notesTimeline: document.getElementById('notesTimeline'),
  
  // User Management
  logoutBtn: document.getElementById('logoutBtn'),

  // --- Timesheet Elements ---
  viewTicketsTab: document.getElementById('viewTicketsTab'),
  viewTimesheetTab: document.getElementById('viewTimesheetTab'),
  timesheetSection: document.getElementById('timesheetSection'),
  filterTabsContainer: document.querySelector('.filter-tabs'),
  hourlyWageInput: document.getElementById('hourlyWageInput'),
  
  tsWeeklyTotal: document.getElementById('tsWeeklyTotal'),
  tsHistoryList: document.getElementById('tsHistoryList'),
  tsPrintBtn: document.getElementById('tsPrintBtn'),
  tsAddManualBtn: document.getElementById('tsAddManualBtn'),
  
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
          await refreshApp();
          await refreshTimesheet();
          startGlobalTimersWatcher();
        } catch (error) {
          console.error('Failed to initialize App:', error);
          alert('Error loading data. Please refresh.');
        }
      } else {
        await refreshApp();
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

  // FAB to open New Ticket
  elements.newTicketFab.addEventListener('click', () => {
    elements.newTicketForm.reset();
    openModal(elements.newTicketModal);
  });

  // Submit New Ticket
  elements.newTicketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticketData = {
      clientName: elements.newClientName.value.trim(),
      clientContact: elements.newClientContact.value.trim(),
      workDescription: elements.newWorkDescription.value.trim(),
      status: 'open',
      createdAt: Date.now(),
      timeSpent: 0
    };

    try {
      const id = await window.AppDB.createTicket(ticketData);
      // Auto add an initial progress note
      await window.AppDB.addNote(id, 'Ticket created.');
      
      closeAllModals();
      await refreshApp();
    } catch (err) {
      console.error('Error creating ticket:', err);
      alert('Could not save ticket.');
    }
  });

  // Filter Tabs
  elements.filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter');
      renderTicketList();
    });
  });

  // Search Input
  elements.searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderTicketList();
  });

  // Status Change Buttons in Details
  elements.statusToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!selectedTicket) return;
      
      const newStatus = btn.getAttribute('data-status');
      
      // Update UI state
      elements.statusToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      selectedTicket.status = newStatus;
      
      // If closing ticket, automatically stop any active timer and record close date
      if (newStatus === 'closed') {
        if (selectedTicket.timerStartedAt) {
          stopTimer();
        }
        selectedTicket.closedAt = Date.now();
      } else {
        selectedTicket.closedAt = null;
      }
    });
  });

  // Timer Toggle (Start/Stop)
  elements.toggleTimerBtn.addEventListener('click', () => {
    if (!selectedTicket) return;
    
    if (selectedTicket.timerStartedAt) {
      stopTimer();
    } else {
      startTimer();
    }
  });

  // Quick Time Adjustments
  elements.quickTimeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!selectedTicket) return;
      const action = btn.getAttribute('data-time');
      
      if (action === 'clear') {
        if (confirm('Are you sure you want to reset all tracked time for this ticket?')) {
          selectedTicket.timeSpent = 0;
          if (selectedTicket.timerStartedAt) {
            selectedTicket.timerStartedAt = Date.now(); // Restart active timer reference
          }
        }
      } else {
        const mins = Number(action);
        selectedTicket.timeSpent = Math.max(0, selectedTicket.timeSpent + mins);
      }
      
      updateTimerDisplay();
    });
  });

  // Manual Time Entry
  elements.addManualTimeBtn.addEventListener('click', () => {
    if (!selectedTicket) return;
    const input = prompt('Enter additional time in minutes (e.g. 45 or -30):');
    if (input === null) return;
    
    const minutes = parseInt(input, 10);
    if (isNaN(minutes)) {
      alert('Please enter a valid number.');
      return;
    }

    selectedTicket.timeSpent = Math.max(0, selectedTicket.timeSpent + minutes);
    updateTimerDisplay();
  });

  // Submit Note Form
  elements.addNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
    
    const noteText = elements.newNoteText.value.trim();
    if (!noteText) return;

    try {
      await window.AppDB.addNote(selectedTicket.id, noteText);
      elements.newNoteText.value = '';
      await loadTicketNotes(selectedTicket.id);
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  });

  // Save Detail and Close
  elements.saveDetailBtn.addEventListener('click', async () => {
    if (!selectedTicket) return;
    
    // Read final work description description field
    selectedTicket.workDescription = elements.detailWorkDesc.value.trim();

    try {
      // If timer is running, we keep the running timestamp so it keeps running in the list
      await window.AppDB.updateTicket(selectedTicket);
      closeAllModals();
      await refreshApp();
    } catch (err) {
      console.error('Failed to update ticket:', err);
      alert('Error saving changes.');
    }
  });

  // Delete Ticket
  elements.deleteTicketBtn.addEventListener('click', async () => {
    if (!selectedTicket) return;
    
    if (confirm(`Are you sure you want to delete the ticket for "${selectedTicket.clientName}"? This will delete all notes too.`)) {
      try {
        if (activeTimerInterval) {
          clearInterval(activeTimerInterval);
          activeTimerInterval = null;
        }
        await window.AppDB.deleteTicket(selectedTicket.id);
        closeAllModals();
        await refreshApp();
      } catch (err) {
        console.error('Failed to delete ticket:', err);
        alert('Could not delete ticket.');
      }
    }
  });

  // --- Timesheet Event Handlers ---
  
  // Tab Navigation toggles
  elements.viewTicketsTab.addEventListener('click', () => {
    switchView('tickets');
  });

  elements.viewTimesheetTab.addEventListener('click', () => {
    switchView('timesheet');
  });

  // Removed live clock in/out listeners

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

  // Open Print Options Modal
  elements.tsPrintBtn.addEventListener('click', () => {
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
  });

  // Handle Print Form Submission
  elements.printOptionsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const empName = elements.optEmpName.value.trim();
    const dept = elements.optDept.value.trim();
    const supervisor = elements.optSupervisor.value.trim();
    const weekEndingStr = elements.optWeekEnding.value; // YYYY-MM-DD
    
    // Save to localStorage as defaults
    localStorage.setItem('ts_print_emp_name', empName);
    localStorage.setItem('ts_print_dept', dept);
    localStorage.setItem('ts_print_supervisor', supervisor);
    
    generateAndPrintTimesheet(empName, dept, supervisor, weekEndingStr);
  });
}

// Global cached list of tickets
let allTickets = [];

// Refresh App Data
async function refreshApp() {
  allTickets = await window.AppDB.getAllTickets();
  updateStatusBadges();
  renderTicketList();
}

// Update badges on the header tabs
function updateStatusBadges() {
  const counts = {
    all: allTickets.length,
    open: allTickets.filter(t => t.status === 'open').length,
    pending: allTickets.filter(t => t.status === 'pending').length,
    closed: allTickets.filter(t => t.status === 'closed').length
  };

  document.getElementById('badge-all').textContent = counts.all;
  document.getElementById('badge-open').textContent = counts.open;
  document.getElementById('badge-pending').textContent = counts.pending;
  document.getElementById('badge-closed').textContent = counts.closed;
}

// Render ticket list to UI
function renderTicketList() {
  elements.ticketList.innerHTML = '';

  // Filter list
  let filtered = allTickets;
  if (currentFilter !== 'all') {
    filtered = filtered.filter(t => t.status === currentFilter);
  }

  if (searchQuery) {
    filtered = filtered.filter(t => 
      t.clientName.toLowerCase().includes(searchQuery) ||
      t.workDescription.toLowerCase().includes(searchQuery) ||
      (t.clientContact && t.clientContact.toLowerCase().includes(searchQuery))
    );
  }

  if (filtered.length === 0) {
    elements.ticketList.innerHTML = `
      <div class="empty-state">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
        <h3>No matching tickets</h3>
        <p>Try refining your search query or filters.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(ticket => {
    const card = document.createElement('div');
    card.className = `ticket-card status-${ticket.status} fade-in`;
    
    // Status color mapping for card left-border CSS variable
    let statusColor = 'var(--text-muted)';
    if (ticket.status === 'open') statusColor = 'hsl(var(--status-open-hue) 100% 50%)';
    if (ticket.status === 'pending') statusColor = 'hsl(var(--status-pending-hue) 100% 65%)';
    if (ticket.status === 'closed') statusColor = 'hsl(var(--status-closed-hue) 100% 45%)';
    card.style.setProperty('--status-color', statusColor);

    // Calculate total display time (including active timer)
    let displayMins = ticket.timeSpent;
    let isTimerActive = !!ticket.timerStartedAt;
    
    if (isTimerActive) {
      const elapsedMs = Date.now() - ticket.timerStartedAt;
      displayMins += Math.floor(elapsedMs / 60000);
    }

    const timeFormatted = formatMinutes(displayMins);
    const dateFormatted = new Date(ticket.createdAt).toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    card.innerHTML = `
      <div class="card-header">
        <div class="card-client">${escapeHTML(ticket.clientName)}</div>
        <div class="card-status-badge">${ticket.status}</div>
      </div>
      <div class="card-desc">${escapeHTML(ticket.workDescription)}</div>
      <div class="card-footer">
        <div>${dateFormatted}</div>
        <div class="card-time" data-ticket-id="${ticket.id}">
          ${isTimerActive ? '<span class="pulse-dot"></span>' : ''}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <span class="card-time-text">${timeFormatted}</span>
        </div>
      </div>
    `;

    // Click handler to open detail modal
    card.addEventListener('click', () => {
      openDetailModal(ticket);
    });

    elements.ticketList.appendChild(card);
  });
}

// Modal Helpers
function openModal(modal) {
  modal.classList.add('active');
}

function closeAllModals() {
  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }
  
  // If editing, save timer state
  if (selectedTicket && elements.detailModal.classList.contains('active')) {
    // If timer was running, update database to store current state
    window.AppDB.updateTicket(selectedTicket).then(() => {
      selectedTicket = null;
      refreshApp();
    }).catch(console.error);
  } else {
    selectedTicket = null;
  }

  elements.newTicketModal.classList.remove('active');
  elements.detailModal.classList.remove('active');
  elements.editTimesheetModal.classList.remove('active');
  elements.printOptionsModal.classList.remove('active');
  if (elements.authModal) elements.authModal.classList.remove('active');
  editingTimesheet = null;
}

// Open Detail View Modal
async function openDetailModal(ticket) {
  selectedTicket = { ...ticket }; // Clone ticket to local editing state
  
  // Populate Info
  elements.detailClientName.textContent = selectedTicket.clientName;
  elements.detailClientContactText.textContent = selectedTicket.clientContact || 'No contact details recorded';
  elements.detailWorkDesc.value = selectedTicket.workDescription;
  
  // Status Class list modifier on details modal wrapper (for styles)
  elements.detailModal.querySelector('.modal-content').className = `modal-content status-${selectedTicket.status}`;

  // Set active status toggle button
  elements.statusToggleBtns.forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('data-status') === selectedTicket.status) {
      btn.classList.add('active');
    }
  });

  // Notes Loader
  await loadTicketNotes(selectedTicket.id);

  // Timer Initialization
  updateTimerDisplay();
  if (selectedTicket.timerStartedAt) {
    resumeTimerUI();
  } else {
    elements.toggleTimerBtn.textContent = 'Start Timer';
    elements.toggleTimerBtn.className = 'btn btn-primary';
  }

  openModal(elements.detailModal);
}

// Load and Display Notes
async function loadTicketNotes(ticketId) {
  elements.notesTimeline.innerHTML = '';
  try {
    const notes = await window.AppDB.getNotesForTicket(ticketId);
    
    if (notes.length === 0) {
      elements.notesTimeline.innerHTML = '<div style="color: hsl(var(--text-muted)); font-size: 13px; text-align: center; padding: 12px 0;">No notes added yet.</div>';
      return;
    }

    notes.forEach(note => {
      const dateFormatted = new Date(note.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const item = document.createElement('div');
      item.className = 'timeline-item';
      item.innerHTML = `
        <div class="timeline-dot"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span>Service Note</span>
            <span>${dateFormatted}</span>
          </div>
          <div class="timeline-body">${escapeHTML(note.noteText)}</div>
        </div>
      `;
      elements.notesTimeline.appendChild(item);
    });
    
    // Auto-scroll timeline to bottom
    elements.notesTimeline.scrollTop = elements.notesTimeline.scrollHeight;
  } catch (err) {
    console.error('Failed to load notes:', err);
  }
}

// --- TIMER LOGIC ---

// Start timer reference on ticket
function startTimer() {
  if (!selectedTicket) return;
  
  selectedTicket.timerStartedAt = Date.now();
  
  // Set class styling and timers
  resumeTimerUI();
  
  // Add progress note about timer starting
  window.AppDB.addNote(selectedTicket.id, 'Work timer started.');
  loadTicketNotes(selectedTicket.id);
}

// Pause/stop timer and calculate elapsed minutes
function stopTimer() {
  if (!selectedTicket || !selectedTicket.timerStartedAt) return;
  
  const elapsedMs = Date.now() - selectedTicket.timerStartedAt;
  const elapsedMins = elapsedMs / 60000;
  
  selectedTicket.timeSpent = Math.max(0, selectedTicket.timeSpent + elapsedMins);
  selectedTicket.timerStartedAt = null;
  
  if (activeTimerInterval) {
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
  }
  
  elements.toggleTimerBtn.textContent = 'Start Timer';
  elements.toggleTimerBtn.className = 'btn btn-primary';
  
  updateTimerDisplay();

  // Add progress note about timer stopping
  const durationText = formatMinutes(elapsedMins);
  window.AppDB.addNote(selectedTicket.id, `Work timer paused. Tracked +${durationText} to session.`);
  loadTicketNotes(selectedTicket.id);
}

// Resume Timer Interface Updates
function resumeTimerUI() {
  elements.toggleTimerBtn.textContent = 'Pause Timer';
  elements.toggleTimerBtn.className = 'btn btn-danger';
  
  if (activeTimerInterval) clearInterval(activeTimerInterval);
  
  activeTimerInterval = setInterval(() => {
    updateTimerDisplay();
  }, 1000);
}

// Update Timer visuals in Detail Modal
function updateTimerDisplay() {
  if (!selectedTicket) return;

  let totalMs = selectedTicket.timeSpent * 60000;
  let activeMs = 0;
  
  if (selectedTicket.timerStartedAt) {
    activeMs = Date.now() - selectedTicket.timerStartedAt;
  }
  
  const overallMs = totalMs + activeMs;
  const totalMinutesRounded = Math.floor(overallMs / 60000);
  
  // Convert overall MS to HH:MM:SS format
  const hours = Math.floor(overallMs / 3600000);
  const minutes = Math.floor((overallMs % 3600000) / 60000);
  const seconds = Math.floor((overallMs % 60000) / 1000);
  
  const formattedHours = String(hours).padStart(2, '0');
  const formattedMinutes = String(minutes).padStart(2, '0');
  const formattedSeconds = String(seconds).padStart(2, '0');
  
  elements.timerDisplay.innerHTML = `
    ${selectedTicket.timerStartedAt ? '<span class="pulse-dot"></span>' : ''}
    ${formattedHours}:${formattedMinutes}:${formattedSeconds}
  `;
  
  elements.totalMinutesDisplay.textContent = `(${totalMinutesRounded} mins total)`;
}

// Background poller to update running timers in the list cards every 30 seconds
function startGlobalTimersWatcher() {
  setInterval(() => {
    const activeCards = document.querySelectorAll('.card-time');
    activeCards.forEach(cardContainer => {
      const ticketId = Number(cardContainer.getAttribute('data-ticket-id'));
      const ticket = allTickets.find(t => t.id === ticketId);
      
      if (ticket && ticket.timerStartedAt) {
        const elapsedMs = Date.now() - ticket.timerStartedAt;
        const currentMins = ticket.timeSpent + Math.floor(elapsedMs / 60000);
        
        const textSpan = cardContainer.querySelector('.card-time-text');
        if (textSpan) {
          textSpan.textContent = formatMinutes(currentMins);
        }
        
        // Ensure pulse dot is there
        if (!cardContainer.querySelector('.pulse-dot')) {
          const dot = document.createElement('span');
          dot.className = 'pulse-dot';
          cardContainer.insertBefore(dot, cardContainer.firstChild);
        }
      }
    });
  }, 10000); // Poll list every 10s to keep it accurate
}

// --- UTILITIES ---

// Format minutes to a clean human-readable hours and minutes string (e.g. 1h 45m or 15m)
function formatMinutes(totalMins) {
  const mins = Math.round(totalMins);
  if (mins < 60) {
    return `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

// Escape HTML for security
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- TIMESHEETS LOGIC & RENDERING ---

// Switch view screen (Tickets vs Timesheets)
function switchView(viewName) {
  currentView = viewName;
  
  if (viewName === 'tickets') {
    elements.viewTicketsTab.classList.add('active');
    elements.viewTimesheetTab.classList.remove('active');
    
    // Show tickets elements
    elements.ticketList.style.display = 'flex';
    elements.newTicketFab.style.display = 'flex';
    elements.searchInput.parentElement.style.display = 'block'; // Search bar
    elements.filterTabsContainer.style.display = 'flex'; // Tickets filter tabs container
    
    // Hide Timesheets
    elements.timesheetSection.style.display = 'none';
  } else {
    elements.viewTicketsTab.classList.remove('active');
    elements.viewTimesheetTab.classList.add('active');
    
    // Hide tickets elements
    elements.ticketList.style.display = 'none';
    elements.newTicketFab.style.display = 'none';
    elements.searchInput.parentElement.style.display = 'none';
    elements.filterTabsContainer.style.display = 'none';
    
    // Show Timesheets
    elements.timesheetSection.style.display = 'flex';
    refreshTimesheet();
  }
}

// Refresh daily timesheet card state and past history list
async function refreshTimesheet() {
  const dateStr = getLocalDateStr();
  
  // Fetch today's entry
  todayTimesheet = await window.AppDB.getTimesheetByDate(dateStr);
  allTimesheets = await window.AppDB.getAllTimesheets();
  
  renderTimesheetHistory();
}

// Render historical timesheet rows
function renderTimesheetHistory() {
  elements.tsHistoryList.innerHTML = '';
  
  const wageRate = elements.hourlyWageInput ? (parseFloat(elements.hourlyWageInput.value) || 0) : 0;

  if (allTimesheets.length === 0) {
    elements.tsHistoryList.innerHTML = '<div style="color: hsl(var(--text-muted)); font-size: 13px; text-align: center; padding: 24px 0;">No timesheet history found.</div>';
    elements.tsWeeklyTotal.textContent = `Weekly Total: 0.0 hrs${wageRate > 0 ? ' ($0.00)' : ''}`;
    return;
  }

  // Calculate weekly total (Current Calendar Week: Monday - Sunday)
  const monday = getThisMondaysDate();
  let weeklyMinutes = 0;

  allTimesheets.forEach(ts => {
    const itemDate = new Date(ts.date + 'T00:00:00'); // Parse in local context
    
    // Sum for week total if record is on/after Monday
    if (itemDate >= monday) {
      const mins = calculateTimesheetMinutes(ts);
      weeklyMinutes += mins;
    }

    // Render Row card
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

    let earningsText = '';
    if (wageRate > 0) {
      const grossEarnings = (totalMins / 60) * wageRate;
      const netEarnings = grossEarnings * (1 - 0.156);
      earningsText = ` <span style="color: var(--primary-color); font-size: 11px; margin-top: 4px; display: block; font-weight: 600;">Gross: $${grossEarnings.toFixed(2)} | Net: $${netEarnings.toFixed(2)}</span>`;
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
          ${earningsText}
        </div>
        <button class="history-edit-btn" data-ts-id="${ts.id}" aria-label="Edit timesheet entry">
          <!-- Pencil Edit Icon -->
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
      </div>
    `;

    // Click handler for editing row
    card.querySelector('.history-edit-btn').addEventListener('click', () => {
      openEditTimesheetModal(ts);
    });

    elements.tsHistoryList.appendChild(card);
  });

  const weeklyHours = (weeklyMinutes / 60).toFixed(1);
  let weeklyTotalText = `Weekly Total: ${weeklyHours} hrs`;
  if (wageRate > 0) {
    const weeklyGross = (weeklyMinutes / 60) * wageRate;
    const weeklyNet = weeklyGross * (1 - 0.156);
    weeklyTotalText += ` (Gross: $${weeklyGross.toFixed(2)} | Net: $${weeklyNet.toFixed(2)})`;
  }
  elements.tsWeeklyTotal.textContent = weeklyTotalText;
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

// Get local date string YYYY-MM-DD
function getLocalDateStr() {
  const d = new Date();
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
  
  // Trigger Print dialog
  setTimeout(() => {
    window.print();
  }, 300);
}


