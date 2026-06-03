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
  
  // Backup / Restore
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),

  // --- Timesheet Elements ---
  viewTicketsTab: document.getElementById('viewTicketsTab'),
  viewTimesheetTab: document.getElementById('viewTimesheetTab'),
  timesheetSection: document.getElementById('timesheetSection'),
  
  tsStatusText: document.getElementById('tsStatusText'),
  tsDateDisplay: document.getElementById('tsDateDisplay'),
  tsWorkingTimeDisplay: document.getElementById('tsWorkingTimeDisplay'),
  tsLunchDisplay: document.getElementById('tsLunchDisplay'),
  
  tsClockInBtn: document.getElementById('tsClockInBtn'),
  tsLunchBtn: document.getElementById('tsLunchBtn'),
  tsClockOutBtn: document.getElementById('tsClockOutBtn'),
  
  tsWeeklyTotal: document.getElementById('tsWeeklyTotal'),
  tsHistoryList: document.getElementById('tsHistoryList'),
  
  // Edit Timesheet Modal
  editTimesheetModal: document.getElementById('editTimesheetModal'),
  editTimesheetForm: document.getElementById('editTimesheetForm'),
  editTsId: document.getElementById('editTsId'),
  editTsDate: document.getElementById('editTsDate'),
  editTsClockIn: document.getElementById('editTsClockIn'),
  editTsLunchDuration: document.getElementById('editTsLunchDuration'),
  editTsClockOut: document.getElementById('editTsClockOut'),
  editTsNotes: document.getElementById('editTsNotes')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.AppDB.getAllTickets(); // Warm up IndexedDB
    await refreshApp();
    await refreshTimesheet(); // Warm up timesheet views
    setupEventListeners();
    startGlobalTimersWatcher(); // Watch for running timers in lists
    startGlobalTimesheetWatcher(); // Start live timesheet clock ticker
  } catch (error) {
    console.error('Failed to initialize App:', error);
    alert('Failed to initialize local database. Please refresh.');
  }
});

// Setup Events
function setupEventListeners() {
  // Modal toggle close buttons
  document.querySelectorAll('.modal-close-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAllModals();
    });
  });

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

  // Export (Backup) Database
  elements.exportBtn.addEventListener('click', async () => {
    try {
      const data = await window.AppDB.exportData();
      const jsonStr = JSON.stringify(data, null, 2);
      
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const dateStr = new Date().toISOString().slice(0, 10);
      const tempLink = document.createElement('a');
      tempLink.href = url;
      tempLink.download = `field-tickets-backup-${dateStr}.json`;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to generate backup.');
    }
  });

  // Import (Restore) Database
  elements.importBtn.addEventListener('click', () => {
    elements.importFile.click();
  });

  elements.importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        if (confirm('Warning: This will OVERWRITE all your current tickets. Proceed?')) {
          await window.AppDB.importData(parsed);
          alert('Database restored successfully.');
          await refreshApp();
          await refreshTimesheet();
        }
      } catch (err) {
        console.error('Import error:', err);
        alert('Invalid file format. Please import a valid backup JSON file.');
      }
      elements.importFile.value = ''; // Reset input
    };
    reader.readAsText(file);
  });

  // --- Timesheet Event Handlers ---
  
  // Tab Navigation toggles
  elements.viewTicketsTab.addEventListener('click', () => {
    switchView('tickets');
  });

  elements.viewTimesheetTab.addEventListener('click', () => {
    switchView('timesheet');
  });

  // Clock In Action
  elements.tsClockInBtn.addEventListener('click', async () => {
    const dateStr = getLocalDateStr();
    
    // Create new timesheet if one doesn't exist
    if (!todayTimesheet) {
      const newEntry = {
        date: dateStr,
        clockIn: Date.now(),
        lunchStart: null,
        lunchEnd: null,
        lunchDuration: 0,
        clockOut: null,
        notes: ''
      };
      await window.AppDB.createTimesheet(newEntry);
    } else {
      // Re-clock in / override existing
      todayTimesheet.clockIn = Date.now();
      todayTimesheet.clockOut = null;
      await window.AppDB.updateTimesheet(todayTimesheet);
    }
    
    await refreshTimesheet();
  });

  // Lunch Toggle Action
  elements.tsLunchBtn.addEventListener('click', async () => {
    if (!todayTimesheet) return;

    if (!todayTimesheet.lunchStart) {
      // Start Lunch
      todayTimesheet.lunchStart = Date.now();
    } else {
      // End Lunch - Calculate elapsed lunch minutes
      const elapsedMs = Date.now() - todayTimesheet.lunchStart;
      todayTimesheet.lunchDuration += Math.floor(elapsedMs / 60000);
      todayTimesheet.lunchStart = null;
    }

    await window.AppDB.updateTimesheet(todayTimesheet);
    await refreshTimesheet();
  });

  // Clock Out Action
  elements.tsClockOutBtn.addEventListener('click', async () => {
    if (!todayTimesheet) return;

    // Auto-calculate final lunch if clocked out on lunch
    if (todayTimesheet.lunchStart) {
      const elapsedMs = Date.now() - todayTimesheet.lunchStart;
      todayTimesheet.lunchDuration += Math.floor(elapsedMs / 60000);
      todayTimesheet.lunchStart = null;
    }

    todayTimesheet.clockOut = Date.now();
    
    const workNotes = prompt('Describe work performed today (optional):');
    if (workNotes !== null) {
      todayTimesheet.notes = workNotes.trim();
    }

    await window.AppDB.updateTimesheet(todayTimesheet);
    await refreshTimesheet();
  });

  // Submit Edit Timesheet Entry Form
  elements.editTimesheetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingTimesheet) return;

    const inTimeStr = elements.editTsClockIn.value; // "HH:MM"
    const outTimeStr = elements.editTsClockOut.value; // "HH:MM" or ""
    const lunchMins = parseInt(elements.editTsLunchDuration.value, 10);
    const notesStr = elements.editTsNotes.value.trim();

    // Construct timestamps using local Date parser helper
    const dateStr = editingTimesheet.date;
    editingTimesheet.clockIn = new Date(`${dateStr}T${inTimeStr}`).getTime();
    
    if (outTimeStr) {
      editingTimesheet.clockOut = new Date(`${dateStr}T${outTimeStr}`).getTime();
    } else {
      editingTimesheet.clockOut = null;
    }

    editingTimesheet.lunchDuration = isNaN(lunchMins) ? 0 : Math.max(0, lunchMins);
    editingTimesheet.notes = notesStr;

    try {
      await window.AppDB.updateTimesheet(editingTimesheet);
      closeAllModals();
      await refreshTimesheet();
    } catch (err) {
      console.error('Failed to update timesheet:', err);
      alert('Error updating timesheet log.');
    }
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
  if (selectedTicket) {
    // If timer was running, update database to store current state
    window.AppDB.updateTicket(selectedTicket).then(() => {
      selectedTicket = null;
      refreshApp();
    });
  }

  elements.newTicketModal.classList.remove('active');
  elements.detailModal.classList.remove('active');
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
    elements.filterTabs.style.display = 'flex'; // Tickets filter tabs
    
    // Hide Timesheets
    elements.timesheetSection.style.display = 'none';
  } else {
    elements.viewTicketsTab.classList.remove('active');
    elements.viewTimesheetTab.classList.add('active');
    
    // Hide tickets elements
    elements.ticketList.style.display = 'none';
    elements.newTicketFab.style.display = 'none';
    elements.searchInput.parentElement.style.display = 'none';
    elements.filterTabs.style.display = 'none';
    
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
  
  // Render Current Date Heading (Readable format)
  const todayDateObj = new Date();
  elements.tsDateDisplay.textContent = todayDateObj.toLocaleDateString(undefined, { 
    weekday: 'long', 
    month: 'short', 
    day: 'numeric' 
  });
  
  updateTimesheetStatusUI();
  renderTimesheetHistory();
}

// Update Active Card banner status and buttons
function updateTimesheetStatusUI() {
  const banner = elements.timesheetSection.querySelector('.timesheet-card');
  banner.className = 'timesheet-card'; // Reset classes
  
  if (!todayTimesheet || (!todayTimesheet.clockIn && !todayTimesheet.clockOut)) {
    // State: Clocked Out
    elements.tsStatusText.textContent = 'Clocked Out';
    banner.classList.add('ts-clockedout');
    
    elements.tsClockInBtn.disabled = false;
    elements.tsLunchBtn.disabled = true;
    elements.tsLunchBtn.textContent = 'Start Lunch';
    elements.tsClockOutBtn.disabled = true;
  } else if (todayTimesheet.clockOut) {
    // State: Clocked Out for today
    elements.tsStatusText.textContent = 'Clocked Out';
    banner.classList.add('ts-clockedout');
    
    elements.tsClockInBtn.disabled = false; // Allow re-clocking in if needed
    elements.tsClockInBtn.textContent = 'Clock In Again';
    elements.tsLunchBtn.disabled = true;
    elements.tsLunchBtn.textContent = 'Start Lunch';
    elements.tsClockOutBtn.disabled = true;
  } else if (todayTimesheet.lunchStart) {
    // State: On Lunch
    elements.tsStatusText.textContent = 'On Lunch';
    banner.classList.add('ts-lunch');
    
    elements.tsClockInBtn.disabled = true;
    elements.tsLunchBtn.disabled = false;
    elements.tsLunchBtn.textContent = 'End Lunch';
    elements.tsClockOutBtn.disabled = false; // Allow clock out direct from lunch
  } else {
    // State: Clocked In & Working
    elements.tsStatusText.textContent = 'Working';
    banner.classList.add('ts-working');
    
    elements.tsClockInBtn.disabled = true;
    elements.tsLunchBtn.disabled = false;
    elements.tsLunchBtn.textContent = 'Start Lunch';
    elements.tsClockOutBtn.disabled = false;
  }
  
  updateTimesheetTimerDisplay();
}

// Update live working timer display in timesheet card
function updateTimesheetTimerDisplay() {
  if (!todayTimesheet || !todayTimesheet.clockIn) {
    elements.tsWorkingTimeDisplay.textContent = '0h 00m';
    elements.tsLunchDisplay.textContent = 'Lunch: 0m';
    return;
  }

  let totalWorkMs = 0;
  let lunchMinutes = todayTimesheet.lunchDuration;
  
  // Calculate Lunch
  if (todayTimesheet.lunchStart) {
    const activeLunchMs = Date.now() - todayTimesheet.lunchStart;
    lunchMinutes += Math.floor(activeLunchMs / 60000);
  }
  elements.tsLunchDisplay.textContent = `Lunch: ${lunchMinutes}m`;

  // Calculate Net Work duration
  if (todayTimesheet.clockOut) {
    totalWorkMs = (todayTimesheet.clockOut - todayTimesheet.clockIn) - (todayTimesheet.lunchDuration * 60000);
  } else if (todayTimesheet.lunchStart) {
    // Frozen working duration at lunch start moment
    totalWorkMs = (todayTimesheet.lunchStart - todayTimesheet.clockIn) - (todayTimesheet.lunchDuration * 60000);
  } else {
    // Actively working
    totalWorkMs = (Date.now() - todayTimesheet.clockIn) - (todayTimesheet.lunchDuration * 60000);
  }

  // Format net work duration as "Xh YYm"
  const totalWorkMins = Math.max(0, Math.floor(totalWorkMs / 60000));
  const hrs = Math.floor(totalWorkMins / 60);
  const mins = totalWorkMins % 60;
  elements.tsWorkingTimeDisplay.textContent = `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

// Loop ticker for live timesheet calculations
function startGlobalTimesheetWatcher() {
  setInterval(() => {
    if (currentView === 'timesheet') {
      updateTimesheetTimerDisplay();
    }
  }, 1000);
}

// Render historical timesheet rows
function renderTimesheetHistory() {
  elements.tsHistoryList.innerHTML = '';
  
  if (allTimesheets.length === 0) {
    elements.tsHistoryList.innerHTML = '<div style="color: hsl(var(--text-muted)); font-size: 13px; text-align: center; padding: 24px 0;">No timesheet history found.</div>';
    elements.tsWeeklyTotal.textContent = 'Weekly Total: 0.0 hrs';
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

    card.innerHTML = `
      <div class="history-left">
        <div class="history-date">${cleanDateFormatted}</div>
        <div class="history-times">${displayClockIn} - ${displayClockOut} | Lunch: ${ts.lunchDuration}m</div>
        ${ts.notes ? `<div class="history-notes" title="${escapeHTML(ts.notes)}">${escapeHTML(ts.notes)}</div>` : ''}
      </div>
      <div class="history-right">
        <div class="history-hours">${decimalHrs} hrs</div>
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
  elements.tsWeeklyTotal.textContent = `Weekly Total: ${weeklyHours} hrs`;
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

