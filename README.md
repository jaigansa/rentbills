# RentBill Pro (Serverless Static Edition)

**RentBill Pro** is a modern, lightweight property and rental management application for landlords and property managers. It runs as a **pure static web application** using **Vanilla HTML5, CSS3, and JavaScript**, backed by **Supabase** for database, authentication, real-time updates, and storage.

---

## Technical Architecture

- **Frontend**: Clean, lightweight Vanilla HTML5, CSS3, and JavaScript (No build step required).
- **Backend / Database**: [Supabase](https://supabase.com) (PostgreSQL with Row Level Security, Auth & Storage).
- **Hosting**: Can be deployed on GitHub Pages, Vercel, Netlify, Cloudflare Pages, or run locally via any web server.
- **Accounting**: Strict integer-based calculations (paise) to prevent IEEE-754 floating-point inaccuracies.

---

## Project Structure

```
.
├── README.md
├── SETUP.md
├── build.sh
├── main.go                  # Go embedded server
├── sql/                     # Modular SQL schema & master setup scripts
│   ├── 00_master_schema.sql # Complete master database script
│   └── ...                  # Individual schema modules (01 to 10)
├── index.html               # Single Page Application entrypoint
├── css/
│   ├── app.css              # Master entry stylesheet
│   ├── variables.css        # Theme variables & design tokens
│   ├── base.css             # Base reset, typography & icon rules
│   ├── layout.css           # Shell layout, sidebar & header
│   ├── components.css       # Stat cards, tables, badges, buttons, dropdowns
│   ├── modals.css           # Modals, drawer & mobile controls
│   └── print.css            # A4 receipt & invoice print engine
├── i18n/
│   ├── en.json              # English translations
│   └── ta.json              # Tamil translations
└── js/
    ├── core/                # Core config, state, UI, theme, i18n
    ├── modules/             # Domain modules (auth, dashboard, properties, bills, etc.)
    └── main.js              # Application entry point
```

---

## Setup & Deployment

### 1. Database Setup (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to the **SQL Editor** in your Supabase dashboard.
3. Run the complete database script found in [`sql/00_master_schema.sql`](sql/00_master_schema.sql).

### 2. Configure Credentials

Update your default credentials in [`js/core/config.js`](js/core/config.js) or configure them directly via the UI in the Settings page:

```javascript
export const SUPABASE_CONFIG = {
  projectIdOrUrl: 'YOUR_PROJECT_ID_OR_URL',
  publishableOrAnonKey: 'YOUR_SUPABASE_ANON_KEY'
};
```

### 3. Local Development

Run the application locally:

```bash
go run main.go
# or serve using any static server:
python3 -m http.server 8080
```
Open `http://localhost:8080` in your browser.

---

## Cross-Platform Single Binary Executable

RentBill Pro can be built into a standalone executable binary file for **Windows, macOS, and Linux** with **zero runtime dependencies** (no Node.js, Python, or web server installation needed on target systems).

### Building Executables

Ensure [Go](https://go.dev) (1.18+) is installed on your build machine, then run:

```bash
./build.sh
```

This compiles single binary executables into the `dist/` directory:
- `dist/rentbill-windows-amd64.exe` (Windows 64-bit)
- `dist/rentbill-darwin-arm64` (macOS Apple Silicon M1/M2/M3)
- `dist/rentbill-darwin-amd64` (macOS Intel)
- `dist/rentbill-linux-amd64` (Linux 64-bit)

### Running Portable Binary

Simply double-click or run the binary from the terminal:

```bash
# On Linux:
./dist/rentbill-linux-amd64

# On macOS:
./dist/rentbill-darwin-arm64

# On Windows:
.\dist\rentbill-windows-amd64.exe
```

The app will start a lightweight embedded web server and automatically open your default browser.

