# JobTracker Timesheet App

JobTracker is a simple, lightweight, and offline-first Progressive Web App (PWA) timesheet system designed specifically for independent field technicians. It allows you to easily log your daily hours, track your weekly earnings, and print professional timesheet reports, all synced securely to the cloud.

## Features

- **Offline-First PWA**: Can be installed on iOS/Android home screens and works offline.
- **Weekly Organization**: Automatically groups your timesheets by work week, calculating total hours, gross pay, and net pay.
- **Auto-Fill Schedule**: Quickly populate a standard Monday-Friday work week with a single button click.
- **Cloud Sync**: Uses Firebase Firestore to securely sync your timesheet data across all your devices in real-time.
- **Print/Export to PDF**: Generate clean, professional weekly timesheet reports for payroll or client billing.
- **Dark Mode UI**: Beautiful, modern dark mode interface designed for readability.

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, ES6 JavaScript
- **Backend/Database**: Firebase Firestore (NoSQL Cloud Database)
- **Authentication**: Firebase Authentication
- **PWA**: Service Workers & Web App Manifest

## Local Development

You can run the app locally using any simple web server:

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx http-server
```

Then visit `http://localhost:8000` in your browser.
