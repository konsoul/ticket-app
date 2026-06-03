/**
 * db.js - Firebase Firestore database wrapper for Ticketing App
 * Provides async/await Promise-based API for managing tickets and progress notes.
 */

const firebaseConfig = {
  apiKey: "AIzaSyDc4j5PrgIZyHyo_MlV1TLVyycFgsTN1kE",
  authDomain: "ticketapp-857a2.firebaseapp.com",
  projectId: "ticketapp-857a2",
  storageBucket: "ticketapp-857a2.firebasestorage.app",
  messagingSenderId: "576702544933",
  appId: "1:576702544933:web:f38f5ffe2668b6bbfa93cc",
  measurementId: "G-2XP9LST2Q1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const dbInstance = firebase.firestore();

// Helper to get current user UID, or throw if not logged in
function getUid() {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated.");
  return user.uid;
}

window.AppDB = {
  // --- AUTHENTICATION ---
  onAuthStateChanged(callback) {
    return auth.onAuthStateChanged(callback);
  },
  async login(email, password) {
    try {
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        // Auto-register if not found
        await auth.createUserWithEmailAndPassword(email, password);
      } else {
        throw err;
      }
    }
  },
  async logout() {
    await auth.signOut();
  },

  // --- TICKETS ---

  async createTicket(ticketData) {
    const uid = getUid();
    const newTicket = {
      clientName: ticketData.clientName || 'Unknown Client',
      clientContact: ticketData.clientContact || '',
      workDescription: ticketData.workDescription || '',
      status: ticketData.status || 'open',
      createdAt: ticketData.createdAt || Date.now(),
      closedAt: null,
      timeSpent: ticketData.timeSpent || 0,
      timerStartedAt: null,
      ...ticketData
    };

    const docRef = await dbInstance.collection('users').doc(uid).collection('tickets').add(newTicket);
    return docRef.id;
  },

  async getTicket(id) {
    const uid = getUid();
    const doc = await dbInstance.collection('users').doc(uid).collection('tickets').doc(String(id)).get();
    if (!doc.exists) throw new Error("Ticket not found");
    return { id: doc.id, ...doc.data() };
  },

  async getAllTickets() {
    const uid = getUid();
    // Fetch tickets sorted by createdAt descending
    const snapshot = await dbInstance.collection('users').doc(uid).collection('tickets')
      .orderBy('createdAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async updateTicket(ticket) {
    const uid = getUid();
    if (!ticket.id) throw new Error('Ticket ID is required for update');
    
    const { id, ...updateData } = ticket;
    await dbInstance.collection('users').doc(uid).collection('tickets').doc(String(id)).update(updateData);
    return ticket;
  },

  async deleteTicket(ticketId) {
    const uid = getUid();
    const tid = String(ticketId);
    
    // Delete all notes first
    const notesSnapshot = await dbInstance.collection('users').doc(uid).collection('notes')
      .where('ticketId', '==', tid)
      .get();
    
    const batch = dbInstance.batch();
    notesSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete ticket
    const ticketRef = dbInstance.collection('users').doc(uid).collection('tickets').doc(tid);
    batch.delete(ticketRef);
    
    await batch.commit();
  },

  // --- NOTES ---

  async addNote(ticketId, noteText) {
    const uid = getUid();
    const note = {
      ticketId: String(ticketId),
      noteText: noteText,
      createdAt: Date.now()
    };
    const docRef = await dbInstance.collection('users').doc(uid).collection('notes').add(note);
    return docRef.id;
  },

  async getNotesForTicket(ticketId) {
    const uid = getUid();
    const snapshot = await dbInstance.collection('users').doc(uid).collection('notes')
      .where('ticketId', '==', String(ticketId))
      .orderBy('createdAt', 'asc')
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // --- TIMESHEETS ---

  async createTimesheet(tsData) {
    const uid = getUid();
    const docRef = await dbInstance.collection('users').doc(uid).collection('timesheets').add(tsData);
    return docRef.id;
  },

  async getTimesheetByDate(dateStr) {
    const uid = getUid();
    const snapshot = await dbInstance.collection('users').doc(uid).collection('timesheets')
      .where('date', '==', dateStr)
      .limit(1)
      .get();
      
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  },

  async getAllTimesheets() {
    const uid = getUid();
    const snapshot = await dbInstance.collection('users').doc(uid).collection('timesheets')
      .orderBy('date', 'desc')
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async updateTimesheet(ts) {
    const uid = getUid();
    if (!ts.id) throw new Error('Timesheet ID required');
    const { id, ...updateData } = ts;
    await dbInstance.collection('users').doc(uid).collection('timesheets').doc(String(id)).update(updateData);
    return ts;
  },

  async deleteTimesheet(tsId) {
    const uid = getUid();
    await dbInstance.collection('users').doc(uid).collection('timesheets').doc(String(tsId)).delete();
  },
  
  // Stubs for legacy import/export functionality which we can safely ignore or mock
  async exportDatabase() {
    return "{}";
  },
  async importDatabase(jsonData) {
    console.log("Import disabled due to cloud migration.");
  }
};
