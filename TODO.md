# Project TODO & Deployment Guide

This file tracks future steps and deployment tasks for the Field Service JobTracker application.

---

## 📋 Outstanding Tasks

- [ ] Deploy app to a public HTTPS server (necessary for iOS PWA installation).
- [ ] Add app to iPhone Home Screen.
- [ ] Perform a backup to test JSON export.

---

## 🌐 Deployment Options

Since the app is a Progressive Web App (PWA), iOS Safari requires a secure `https://` connection to register service workers and enable the **"Add to Home Screen"** function.

### Option A: GitHub Pages (Recommended)
This option uses Git to host your code directly from a GitHub repository for free.

1. **Create a GitHub Repository**:
   - Go to [github.com](https://github.com) and create a new repository (e.g., `jobtracker`).
2. **Initialize Git and Push Code**:
   Run the following commands in the project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of JobTracker PWA"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```
3. **Enable GitHub Pages**:
   - Go to your repository settings on GitHub.
   - Click on **Pages** in the left sidebar.
   - Under **Build and deployment**, select **Deploy from a branch** and choose the `main` branch.
   - Save. Your site will be live at `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/` in a few minutes.

> [!NOTE]
> If deploying to a subfolder on GitHub Pages (e.g., `https://username.github.io/repo-name/`), make sure to update the paths in `manifest.json` and `sw.js` (e.g., changing `./` paths to match the subfolder path if the browser has scoping issues, though standard relative `./` paths should work).

---

### Option B: Netlify (Drag-and-Drop)
This is the absolute simplest way to deploy without using Git commands.

1. Go to [Netlify Drop](https://app.netlify.com/drop).
2. Drag and drop your entire `Ticketing App` folder onto the web page.
3. Netlify will instantly generate a live URL (e.g., `https://random-name.netlify.app`).
4. (Optional) Go to site settings to customize the subdomain name to something easy to type.

---

### Option C: Vercel (CLI or Drag-and-Drop)
Similar to Netlify, Vercel allows instant deployments.

1. Go to [Vercel Dashboard](https://vercel.com).
2. Connect your GitHub repository or use their CLI tool by running `npx vercel` inside the project folder.
3. Follow the CLI prompts to deploy instantly.

---

## 📱 Installing on iPhone

Once deployed to an `https://` address:

1. Open the URL in **Safari** on your iPhone.
2. Tap the **Share** button (the square icon with an up arrow at the bottom of the screen).
3. Scroll down the list of options and tap **Add to Home Screen**.
4. Name the application and tap **Add** in the top right.
5. The JobTracker icon will appear on your phone's screen. Tap it to launch the app in standalone native mode (no browser address bar).
