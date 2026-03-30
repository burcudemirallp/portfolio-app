# Portfolio Tracker

A self-hosted investment portfolio management application. Track your stocks, funds, gold, crypto and other instruments across multiple accounts with real-time price updates.

## Features

- **Portfolio Management** — Buy/sell tracking, position management, add-to-position with average cost calculation
- **Real-time Prices** — Automatic price fetching via yfinance, TEFAS and web scraping
- **Dashboard** — Total value, cost, P/L, asset allocation charts, portfolio value over time via snapshots
- **Performance Analysis** — Snapshot-based performance comparison between date ranges
- **TWR (Time-Weighted Return)** — Accurate return calculation that eliminates the effect of cash flows
- **Benchmark Comparison** — Compare portfolio TWR against XAU/USD, USD/TRY, BIST 100/30 and silver
- **Insights** — Model portfolio comparison, concentration risk analysis, action items/to-do list
- **Cash Flows** — Track external money in/out of the portfolio
- **Sales History** — Detailed sale records with holding period, P/L, monthly charts and CSV export
- **Multi-account** — Manage instruments across different brokerage accounts
- **Tagging System** — Primary and secondary tags for categorization and filtering
- **Notifications** — Price alerts and system notifications
- **Snapshot & CSV Export** — Save portfolio snapshots and export data as CSV
- **Multi-language** — Turkish and English UI, switchable from Settings
- **Onboarding Tour** — Interactive product tour for first-time users
- **Admin Panel** — Multi-user support with admin account switching

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, Uvicorn |
| Database | SQLite |
| Frontend | React 19, Vite 7, Tailwind CSS 3 |
| Charts | Recharts |
| Auth | JWT (PyJWT) + passlib/bcrypt |
| Prices | yfinance, requests (web scraping) |
| Scheduling | APScheduler |

## Prerequisites

- Python 3.10+
- Node.js 20+
- npm

## Installation

```bash
# Clone the repo
git clone https://github.com/<your-username>/portfolio-app.git
cd portfolio-app

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install backend dependencies
pip install -r requirements.txt

# Install frontend dependencies
cd frontend
npm install
cd ..

# Create environment file
cp .env.example .env
# Edit .env and set your own SECRET_KEY
```

## Configuration

Create a `.env` file in the project root:

```env
DATABASE_URL=sqlite:///./portfolio.db
SECRET_KEY=your-secret-key-change-this
```

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLAlchemy database URL | `sqlite:///./portfolio.db` |
| `SECRET_KEY` | JWT signing key — **change this in production** | — |

## Usage

### Quick Start

```bash
./start.sh
```

This starts both the backend (port 8000) and frontend dev server (port 5173) and prints the local network URL so you can access the app from other devices on the same WiFi.

### Manual Start

```bash
# Terminal 1 — Backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev -- --host 0.0.0.0
```

### Stop

```bash
./stop.sh
```

### Access

- **Frontend:** http://localhost:5173
- **API:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs

On first visit, register a new account. The first registered user is automatically an admin.

## Project Structure

```
portfolio-app/
├── app/                    # Backend (FastAPI)
│   ├── main.py             # API routes & business logic
│   ├── models.py           # SQLAlchemy models
│   ├── schemas.py          # Pydantic schemas
│   ├── db.py               # Database connection
│   └── services/
│       ├── auth.py         # JWT authentication
│       ├── fx.py           # FX rate service
│       ├── pricing.py      # Price fetching (yfinance, scraping)
│       ├── scanner.py      # Price scanner
│       └── scheduler.py    # Background job scheduler
├── frontend/               # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/     # Page & UI components
│   │   ├── contexts/       # Auth & Language contexts
│   │   ├── i18n/           # Translation files (tr.json, en.json)
│   │   └── services/       # API client (axios)
│   └── package.json
├── requirements.txt        # Python dependencies
├── start.sh                # Start both servers
├── stop.sh                 # Stop both servers
└── .env                    # Environment variables (not in repo)
```

## License

This project is for personal use.
