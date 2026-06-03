# Field Service JobTracker

**JobTracker** is a simple, lightweight, and offline-first Progressive Web App (PWA) ticketing system designed specifically for independent field technicians. It lets you easily log client requests, track active service times, capture progress notes, and manage ticket status while working on-site.

---

## 💡 The Core Concept

Field work often takes technicians into basements, server closets, or remote areas with poor cellular signal. Standard cloud-based ticketing systems fail or load slowly in these environments. 

**JobTracker** solves this by operating as a Progressive Web App (PWA) that runs entirely inside your mobile browser and stores data locally. It has **zero database hosting costs**, loads instantly, and offers **full offline availability**.

---

## 🛠️ Tech Stack

To ensure simplicity, speed, and easy scalability, the application is built using a modern, serverless client-side architecture:

1. **Frontend Structure**: HTML5 Semantic markup.
2. **Styling**: Vanilla CSS3 with:
   - Custom HSL color design systems (customized for Open, Pending, and Closed statuses).
   - Glassmorphic card styling, responsive layouts optimized for mobile/touch screens, and micro-animations.
3. **Behavior & Logic**: Modern Vanilla JavaScript (ES6+).
4. **Data Persistence**: **IndexedDB API** (via a Promise-based database wrapper) for storing large amounts of structured data on the client side.
5. **Offline & App Installation**:
   - **Service Workers (`sw.js`)**: Intercepts requests to serve cached assets when offline.
   - **PWA Manifest (`manifest.json`)**: Configures display behaviors, background colors, and app icons so the app can be installed on iOS/Android home screens as a native application.

---

## 📂 Folder Structure

```text
Ticketing App/
├── assets/
│   ├── icon-192.png         # PWA app icon (192x192)
│   └── icon-512.png         # PWA app icon (512x512)
├── css/
│   └── styles.css           # Styling, design variables, and responsive layout
├── js/
│   ├── app.js               # UI controller, event handlers, and timer logic
│   └── db.js                # IndexedDB connection and CRUD wrappers
├── index.html               # Main Single-Page Application (SPA) layout
├── manifest.json            # PWA web manifest file
├── sw.js                    # Service Worker caching logic for offline usage
└── README.md                # Project documentation
```

---

## 🚀 Key Features

* **Offline Capabilities**: Full offline operations. Created/modified tickets, time trackings, and service notes sync to local storage immediately and persist across sessions.
* **Service Time Tracking**:
  - **Live Timer**: One-tap Start/Stop timer tracking hours, minutes, and seconds.
  - **State Persistence**: Running timers persist. If you exit the browser or close the ticket, the database remembers when it was started. Reopening the app calculates elapsed time and resumes automatically.
  - **Manual Logs & Offsets**: Adjust time on the fly (e.g. `+15 min`, `+30 min`, `+1 hr`) or manually type exact minutes.
* **Progress & Timeline Notes**: Add chronological notes detailing computer/network fixes, serial numbers, or resolutions.
* **Local Data Backup**: Backup all tickets and notes to a `.json` file to store in your personal drive (Google Drive, iCloud, etc.), and restore database backups with a single click.

---

## ⚙️ How to Run & Install

### 1. Run Locally
Because the app uses Service Workers and IndexedDB, it should be served from a web server (rather than opening the `.html` file directly) to allow all browser APIs to work correctly.

You can launch a lightweight local server from this directory:
```bash
python3 -m http.server 8000
```
Then, navigate to **[http://localhost:8000](http://localhost:8000)** in your browser.

### 2. Add to Home Screen (Mobile Installation)
* **iOS Safari**: Open the web application URL, tap the **Share** button, scroll down, and tap **Add to Home Screen**.
* **Android Chrome**: Open the URL, tap the three-dot menu icon, and tap **Add to Home screen** (or click the install prompt in the address bar).
