# Ice Cold Auto Aircon — React + Node.js

An updated, deployment-ready **React (Vite) frontend** and **Node.js / Express / SQLite backend**, converted from the provided Ice Cold Auto Aircon website. The original navy/blue design, copy, prices, FAQ content and admin functionality are retained.

## Requirements

- **Node.js 20.19+ or 22+** and npm
- A **persistent writable disk** for SQLite in production
- HTTPS in production (typically provided by your hosting platform / reverse proxy)

## Local development

```bash
npm install
cp .env.example .env
# Edit .env to set strong ADMIN_PASSWORD and SESSION_SECRET
npm run dev
```

- Public website: **http://localhost:5173**
- Admin: **http://localhost:5173/admin**
- Backend API: **http://localhost:3001/api/health**

Vite proxies `/api` to Express during development, so requests/cookies stay on the same browser origin.

## Production (one Node service)

```bash
npm install
npm run build
# Supply environment variables; do not use placeholder credentials
NODE_ENV=production PORT=3000 npm start
```

Open `http://localhost:3000` (in real deployment, use your HTTPS domain). The Node service serves the **compiled React build** and all `/api/*` endpoints, including `/admin` and React deep links.

Important environment variables:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `production` in deployment |
| `PORT` | Host-provided port; defaults to `3000` in production / `3001` in dev |
| `SESSION_SECRET` | **Required in production**; unique secret of at least 32 characters |
| `ADMIN_USER` | Initial admin user, default `admin` |
| `ADMIN_PASSWORD` | **Required on first production run**; stored as a bcrypt hash in SQLite |
| `DATABASE_PATH` | Optional full SQLite path; defaults to `./data/data.db` |
| `TRUST_PROXY` | Number of trusted HTTPS proxies; default `1` in production |

### Docker deployment

```bash
cp .env.example .env
# Set NODE_ENV=production and strong ADMIN_PASSWORD and SESSION_SECRET
# Set PORT=3000 (or remove PORT from .env when using Docker Compose)
docker compose up --build -d
```

The Compose volume `icecold_data` persists the SQLite database across container restarts. For a public domain, configure HTTPS termination at a reverse proxy (Caddy, Nginx, hosting load balancer). Since admin sessions use `secure` cookies in production, admin login requires HTTPS externally.

**Platforms with ephemeral filesystems:** mount a persistent volume and set `DATABASE_PATH` to that volume. Without persistent storage, bookings, reviews, admin passwords, availability, and sessions will be lost on redeploy. For hosts without persistent disks use a managed database migration before launching. A free static-only host cannot run this backend.

## Existing site data / migration

The original ZIP includes a working SQLite database and `.env` containing potentially private data. **Those are deliberately NOT included in this converted ZIP.** The new project creates its own database with the original default services/packages on first start.

To preserve existing bookings, reviews, admin account and availability: stop the original server, back up its database, and copy its **consistent** `data.db` into this project's `data/data.db` before starting (or set `DATABASE_PATH` to its location). SQLite WAL mode means that you should close the original app and checkpoint it safely before copying; copying only `data.db` while `data.db-wal` is active can lose records. Keep the old `.env` secrets private and rotate them if they were shared.

## Features

- Pages: Home, About, Services, Reviews, FAQs, Contact
- Responsive hamburger navigation and legacy `.html` URL redirects
- Live service/package prices administered through the backend
- Booking form with available date/time slots (conflicting reservations rejected atomically)
- Reviews sent for moderation; approved reviews shown publicly
- Admin login/logout, bookings, appointment availability, review approval, service/package management and password change
- HTTP security headers, admin sessions persisted to SQLite, CSRF header checks and rate-limits

## Project layout

```text
client/                  React / Vite UI
  src/pages/            Public React pages and Admin
  src/components/       Navigation, catalogs and shared UI
  public/logo.jpeg      Original image asset
server/index.js         Express routes and production static hosting
server/db.js            SQLite tables, migrations and initial products
server/session-store.js Persistent admin sessions
scripts/dev.mjs         Launches backend and frontend in development
Dockerfile, compose.yaml Optional container deployment
```

## Checks

```bash
npm test
npm run build
```

Use your browser to verify booking submission, admin login, availability, price changes and review approvals before going live. Set real branding/contact details if needed.
