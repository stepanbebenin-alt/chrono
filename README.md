# 🏥 Chrono — Clinical Child Symptom Diary

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/stepanbebenin-alt/chrono)

A modern, lightweight, and fast app for fever tracking, keeping a child's illness diary, and generating 48-hour clinical reports for your pediatrician.

Ready for **instant free deployment on Render (render.com)** as well as local execution with **Node.js (JS)** or **Rust**!

---

## 🚀 1-Click Deploy to Render

Click the **Deploy to Render** button above or follow these steps:

1. Go to **[dashboard.render.com](https://dashboard.render.com/)**.
2. Click **New +** → **Blueprint**.
3. Select the `chrono` repository (or enter `https://github.com/stepanbebenin-alt/chrono`).
4. Click **Apply** — Render will read `render.yaml`, create a free web service, and provide an HTTPS URL `https://chrono-clinical.onrender.com`!

`render.yaml` configuration:
```yaml
services:
  - type: web
    name: chrono-clinical
    runtime: node
    plan: free
    region: frankfurt
    buildCommand: npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    envVars:
      - key: NODE_VERSION
        value: 20.20.1
      - key: PORT
        value: 10000
```

---

## 💻 Running Locally

### Option A: Run with Node.js (JavaScript) — easiest
Run **`START_LOCAL_SERVER.bat`** in the project folder (or `node server.js`).
The server starts immediately at `http://localhost:3000`.

### Option B: Run with Rust (Axum + Tokio)
If you have Rust installed:
```bash
cargo run --release
```
(or run **`START_RUST_SERVER.bat`**).

### Option C: Standalone Browser Mode (no server required)
Double-click **`static/index.html`** (or `index.html`) in any browser! All data is stored locally in `localStorage`.

---

## ✨ Key Features

- 🔐 **Registration & Sign-In Screen** with 1-click guest/demo access.
- 🎨 **4 High-Contrast Color Themes**:
  - 🌑 **Dark** (*Midnight Slate*) — gentle dark mode that won't glare at night.
  - ☀️ **Light** (*Clinical Light*) — clean medical daylight interface.
  - 🌿 **Mint** (*Calm Mint*) — soothing emerald tone.
  - 🌸 **Warm** (*Soft Warmth*) — soft, warm pastel palette.
- 👶 **Child Profiles** (name, age, exact weight in kg for antipyretic dosing, episode/concerns) with 1-click switching.
- 📊 **Interactive 48-Hour Chart** of temperature and medications.
- ⏱️ **Quick Entry** with one-tap temperature buttons (`37.5°`, `38.0°`, `38.5°`, `39.0°`) and symptom chips.
- 📄 **QR Code & PDF Report Generator** for pediatrician visits.
- 🚨 **SOS Emergency (911 / 112)** with clinical red flags and a ready-to-read dispatcher summary.
