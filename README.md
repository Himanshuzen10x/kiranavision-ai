KiranaVision AI — Alternative Credit Scoring for Kirana Stores

<div align="center">

![KiranaVision AI](https://img.shields.io/badge/KiranaVision-AI-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMSIgc3Ryb2tlPSIjNjM2NmYxIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=)
![Version](https://img.shields.io/badge/version-2.1_Beta-06b6d4?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-10b981?style=for-the-badge)
![HTML](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

**AI-powered underwriting system for unorganized retail (Kirana stores) — no traditional financial data needed.**

[🚀 Live Demo](https://himanshuzen10x.github.io/kiranavision-ai/) • [📖 How It Works](#how-it-works) • [🛠 Features](#features)


</div>

---

## 🏦 What is KiranaVision AI?

India has **60+ million** unorganized Kirana stores — none of them have formal credit history, balance sheets, or ITR filings. Traditional banks can't underwrite them.

**KiranaVision AI** solves this by estimating creditworthiness using:
- 📸 **Shop interior photos** (shelf density, SKU diversity, brand mix)
- 🗺️ **GPS location** (neighborhood wealth, footfall, infrastructure density)

No CIBIL score needed. No documents. Just a photo and a location.

---

## ✨ Features

### 📸 Multi-Photo Upload (1–5 Photos)
- Upload up to **5 shelf interior photos** at once
- Thumbnail grid with individual remove buttons
- Photo counter badge (0/5)
- EXIF metadata extraction (device, timestamp)

### 🗺️ Google Maps Location Picker
- **Interactive map** using Google's actual tile layers (road/satellite/hybrid)
- **Search box** — type any city, area, or landmark (powered by Nominatim)
- **Click-to-pin** — click anywhere on the map to drop a location pin
- **Drag-to-adjust** — fine-tune the pin position
- **"My Location"** button using browser GPS

### 📍 Auto Geocoding (Nominatim API)
- Auto-detects **City, District, State, Country, PIN Code, Area Type**
- Fires automatically on pin placement — no manual entry
- Real-time status: "✅ Location detected"

### 🏘️ Neighborhood Intelligence (Overpass API)
- Queries OpenStreetMap within **500m radius**
- Returns real counts: **Houses, Shops, Road junctions**
- Calculates **Estimated Daily Footfall**

### 🔬 6-Step AI Analysis Pipeline
| Step | Analysis |
|------|----------|
| 1 | Image Preprocessing & Anti-Spoofing |
| 2 | Shelf Density & SKU Analysis |
| 3 | Brand Recognition & Premium Ratio |
| 4 | Geo-Spatial & Neighborhood Analysis |
| 5 | AI Credit Scoring Engine |
| 6 | Fraud & Consistency Validation |

### 🛡️ Fraud Detection (Real Canvas Pixel Analysis)
- **Brightness histogram** — detects over-bright screen photos
- **Variance analysis (σ)** — catches uniform/printed images
- **Edge density** — too-smooth images flagged
- **Saturation check** — neon/screen glare detection
- **Aspect ratio** — 16:9, 4:3 etc. + high brightness = screen risk
- **Black bar detection** — letterbox frames
- **File metadata** — size (`>50KB`), freshness (`<72hrs`)

### 📊 Credit Output
- **Credit Score** (0–850)
- **Loan Decision**: Approve / Manual Review / Reject
- **Approved Loan Limit**
- **Monthly Revenue & Net Income Estimate**
- **Risk Category**: Low / Medium / High
- **Downloadable JSON Report**

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, Vanilla CSS, Vanilla JavaScript |
| Mapping | [Leaflet.js](https://leafletjs.com/) + Google Maps Tiles |
| Geocoding | [Nominatim API](https://nominatim.org/) (OpenStreetMap) |
| Spatial Analysis | [Overpass API](https://overpass-api.de/) |
| Spoofing Detection | Canvas 2D API (pixel-level analysis) |
| Design | Dark Glassmorphism, CSS Variables, Micro-animations |

**Zero backend. Zero API keys. Zero cost to run.**

---

## 🚀 How to Run Locally

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/kiranavision-ai.git
cd kiranavision-ai

# Serve locally (any static file server works)
python3 -m http.server 5500

# Or use VS Code Live Server
# Open index.html → Right click → Open with Live Server
```

Then open **http://localhost:5500** in your browser.

> ⚠️ Must be served via HTTP (not `file://`) for Leaflet maps and API calls to work.

---

## 📁 Project Structure

```
kiranavision-ai/
├── index.html     # UI — all sections: hero, upload, map picker, results
├── styles.css     # Dark glassmorphism design system + all components
└── engine.js      # Core logic: CV scoring, geocoding, fraud detection, maps
```

---

## 🗺️ How It Works

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Upload 1-5     │    │  Pin Location on │    │  Run AI Engine  │
│  Shop Photos    │───▶│  Google Map      │───▶│  (6 steps)      │
│  (JPG/PNG/WEBP) │    │  (or search/GPS) │    │                 │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                         │
              ┌──────────────────────────────────────────┘
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Credit Decision Output                      │
│  ✅ APPROVE / ⚠ MANUAL REVIEW / ❌ REJECT                      │
│  Credit Score: 742   Approved Limit: ₹2,50,000                 │
│  Monthly Revenue: ₹1.2L–₹1.8L   Net Income: ₹14K–₹22K        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📸 Screenshots

> *Add screenshots here after deployment*
> <img width="1299" height="665" alt="Screenshot 2026-04-24 at 7 30 42 PM" src="https://github.com/user-attachments/assets/4321b03f-e9f7-452c-b5ab-d8196072300d" />
<img width="1299" height="665" alt="Screenshot 2026-04-24 at 7 31 01 PM" src="https://github.com/user-attachments/assets/040ff7d7-e4ba-4a55-8803-177a361180e5" />
<img width="1299" height="665" alt="Screenshot 2026-04-24 at 7 31 20 PM" src="https://github.com/user-attachments/assets/c13f4538-8e2f-4b32-8186-25a767348a41" />
<img width="1299" height="665" alt="Screenshot 2026-04-24 at 7 31 34 PM" src="https://github.com/user-attachments/assets/cc02a5be-d2c2-436a-a006-83de85d02781" />
<img width="1299" height="333" alt="Screenshot 2026-04-24 at 7 32 18 PM" src="https://github.com/user-attachments/assets/188e4fe0-069c-47bb-a26d-d2f9c7e5cce8" />






---

## ⚠️ Disclaimer

This is a **prototype system**. All CV scores are AI-estimated simulations. Outputs require human review before any actual lending decision. Not intended for production use without proper model validation and regulatory compliance.

---

## 📄 License

License — free to use, modify, and distribute.

---

<div align="center">
Made with ❤️ for Bharat's unorganized retail ecosystem
</div>
