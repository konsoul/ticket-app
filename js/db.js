/**
 * db.js - IndexedDB database wrapper for Ticketing App
 * Provides async/await Promise-based API for managing tickets and progress notes.
 */

const DB_NAME = 'FieldServiceTicketingDB';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Initializes and opens the IndexedDB database.
 * Creates the "tickets" and "notes" object stores if they don't exist.
 */
function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database failed to open:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create tickets store
      if (!db.objectStoreNames.contains('tickets')) {
        const ticketStore = db.createObjectStore('tickets', { keyPath: 'id', autoIncrement: true });
        ticketStore.createIndex('status', 'status', { unique: false });
        ticketStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Create notes store
      if (!db.objectStoreNames.contains('notes')) {
        const notesStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        notesStore.createIndex('ticketId', 'ticketId', { unique: false });
        notesStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Executes a database transaction.
 * @param {string} storeName - Store to access
 * @param {string} mode - 'readonly' or 'readwrite'
 * @param {function} callback - Transaction operations
 */
async function runTransaction(storeName, mode, callback) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    
    let result;
    try {
      result = callback(store);
    } catch (err) {
      transaction.abort();
      return reject(err);
    }

    transaction.oncomplete = () => resolve(result);
    transaction.onerror = (event) => reject(event.target.error);
  });
}

const db = {
  // --- TICKETS ---

  /**
   * Adds a new ticket.
   * @param {Object} ticketData 
   */
  async createTicket(ticketData) {
    const newTicket = {
      clientName: ticketData.clientName || 'Unknown Client',
      clientContact: ticketData.clientContact || '',
      workDescription: ticketData.workDescription || '',
      status: ticketData.status || 'open', // open, pending, closed
      createdAt: ticketData.createdAt || Date.now(),
      closedAt: null,
      timeSpent: ticketData.timeSpent || 0, // in minutes
      timerStartedAt: null, // timestamp if timer is running
      ...ticketData
    };

    return runTransaction('tickets', 'readwrite', (store) => {
      const request = store.add(newTicket);
      return new Promise((resolve, reject) => {
        request.onsuccess = (e) => resolve(e.target.result); // returns auto-incremented ID
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  /**
   * Retrieves a single ticket by ID.
   * @param {number} id 
   */
  async getTicket(id) {
    return runTransaction('tickets', 'readonly', (store) => {
      const request = store.get(Number(id));
      return new Promise((resolve, reject) => {
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  /**
   * Retrieves all tickets, sorted by creation date descending.
   */
  async getAllTickets() {
    return runTransaction('tickets', 'readonly', (store) => {
      const request = store.openCursor(null, 'prev'); // cursor in reverse order (newest first)
      const list = [];
      return new Promise((resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            list.push(cursor.value);
            cursor.continue();
          } else {
            resolve(list);
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  /**
   * Updates an existing ticket.
   * @param {Object} ticket 
   */
  async updateTicket(ticket) {
    if (!ticket.id) throw new Error('Ticket ID is required for update');
    
    return runTransaction('tickets', 'readwrite', (store) => {
      const request = store.put(ticket);
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(ticket);
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  /**
   * Deletes a ticket and all its associated notes.
   * @param {number} ticketId 
   */
  async deleteTicket(ticketId) {
    const tid = Number(ticketId);
    
    // First delete all notes associated with this ticket
    const notes = await this.getNotesForTicket(tid);
    await runTransaction('notes', 'readwrite', (store) => {
      const promises = notes.map(n => {
        return new Promise((resolve, reject) => {
          const req = store.delete(n.id);
          req.onsuccess = () => resolve();
          req.onerror = (e) => reject(e.target.error);
        });
      });
      return Promise.all(promises);
    });

    // Then delete the ticket
    return runTransaction('tickets', 'readwrite', (store) => {
      const request = store.delete(tid);
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  // --- NOTES ---

  /**
   * Adds a progress note to a ticket.
   * @param {number} ticketId 
   * @param {string} noteText 
   */
  async addNote(ticketId, noteText) {
    const note = {
      ticketId: Number(ticketId),
      noteText: noteText,
      createdAt: Date.now()
    };

    return runTransaction('notes', 'readwrite', (store) => {
      const request = store.add(note);
      return new Promise((resolve, reject) => {
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  /**
   * Retrieves all notes associated with a ticket, sorted chronologically.
   * @param {number} ticketId 
   */
  async getNotesForTicket(ticketId) {
    const tid = Number(ticketId);
    return runTransaction('notes', 'readonly', (store) => {
      const index = store.index('ticketId');
      const request = index.openCursor(IDBKeyRange.only(tid));
      const list = [];
      return new Promise((resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            list.push(cursor.value);
            cursor.continue();
          } else {
            // Sort by createdAt ascending (chronological)
            list.sort((a, b) => a.createdAt - b.createdAt);
            resolve(list);
          }
        };
        request.onerror = (e) => reject(e.target.error);
      });
    });
  },

  /**
   * Backup all database records to a serializable object.
   */
  async exportData() {
    const tickets = await this.getAllTickets();
    
    // Retrieve notes for all tickets
    const db = await initDB();
    const notesList = await new Promise((resolve, reject) => {
      const transaction = db.transaction('notes', 'readonly');
      const store = transaction.objectStore('notes');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return {
      version: DB_VERSION,
      exportDate: Date.now(),
      tickets: tickets,
      notes: notesList
    };
  },

  /**
   * Restore database from imported JSON data.
   * @param {Object} data - Exported data containing tickets and notes
   */
  async importData(data) {
    if (!data || !Array.isArray(data.tickets) || !Array.isArray(data.notes)) {
      throw new Error('Invalid export file format');
    }

    const db = await initDB();
    
    // Clear existing data
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(['tickets', 'notes'], 'readwrite');
      transaction.objectStore('tickets').clear();
      transaction.objectStore('notes').clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
    });

    // Populate data
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['tickets', 'notes'], 'readwrite');
      
      const ticketStore = transaction.objectStore('tickets');
      data.tickets.forEach(ticket => {
        ticketStore.put(ticket); // put preserves key if it exists
      });

      const noteStore = transaction.objectStore('notes');
      data.notes.forEach(note => {
        noteStore.put(note);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
    });
  }
};

// Export to window for global access
window.AppDB = db;
