# Ice Cold Auto Aircon — React + Node.js + MongoDB

React (Vite) frontend and Node/Express backend. MongoDB stores bookings, availability, reviews, catalog items, admin accounts, and sessions. No local database or Render persistent disk is needed.

## Local development

Requires Node.js 22+ and MongoDB Atlas, or a local MongoDB replica set (standalone MongoDB does not support the booking transactions).

```sh
npm ci
# Copy .env.example to .env and supply your own values.
npm run dev
```

Set `MONGODB_URI`, `ADMIN_PASSWORD`, and `SESSION_SECRET` in `.env`. Keep it private. First startup creates the admin account and the default services/packages. Subsequent restarts preserve edits and do not reset the password or restore deleted catalog items.

- Frontend: http://localhost:5173
- Admin: http://localhost:5173/admin
- Backend health: http://localhost:3001/api/health

## MongoDB Atlas setup

1. Create an Atlas cluster (the free option can be used).
2. Under Database Access, create a database user with read/write access to the `ice_cold` database. This is separate from your Atlas account login.
3. Under Network Access, allow your Render service's outbound IP ranges and your local development IP. Find the outbound ranges in Render's service dashboard.
4. Choose Connect → Drivers → Node.js and copy the connection string. Replace the username/password placeholders; URL-encode special characters in credentials.
5. Set `MONGODB_URI` to that connection string and `MONGODB_DB=ice_cold` in your environment. The app creates its collections and indexes automatically.

Atlas replica-set transactions commit each booking and its slot reservation together. Cancelled bookings release their slots and cannot be reopened; submit a new booking instead. Session expiry is enforced on every lookup, with a MongoDB TTL index cleaning up expired records.

## Render backend + Vercel frontend

Create a Render **Web Service** connected to this repo, branch `main`:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Root Directory | Leave blank (repository root) |
| Build Command | `npm ci --omit=dev` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance | Free is sufficient to run the backend; normal free-service sleep/usage limits apply |

If Render selected Docker automatically, the existing Dockerfile also works without any disk. It builds a copy of the frontend as well; Vercel can still serve your public frontend.

Set these variables in Render, not in Git:

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | `22` (Node runtime) |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Your Atlas connection string |
| `MONGODB_DB` | `ice_cold` |
| `ADMIN_USER` | Your initial admin username |
| `ADMIN_PASSWORD` | A strong unique initial password |
| `SESSION_SECRET` | A unique random secret of at least 32 characters |
| `TRUST_PROXY` | `1` |

Remove `DATABASE_PATH`. Let Render supply `PORT`. Do not attach a disk. Keep `SESSION_SECRET` stable across deploys to preserve logins. Changing `ADMIN_PASSWORD` in the environment does not reset an existing admin; use Admin → Account.

After deployment, `https://ice-final.onrender.com/api/health` should return `{"status":"ok"}`. This endpoint checks MongoDB too; it returns HTTP 503 when the database is unavailable.

The frontend uses relative `/api` requests. The root `vercel.json` proxies these requests to `https://ice-final.onrender.com` before applying the SPA fallback. Keep the Vercel Root Directory at the repository root (leave blank). The routing configuration is:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://ice-final.onrender.com/api/:path*" },
    { "source": "/((?!api(?:/|$)).*)", "destination": "/index.html" }
  ]
}
```

Keep any existing Vercel build/output settings. Redeploy Vercel after configuring the rewrite. Proxying `/api` keeps login cookies on the frontend origin; no cross-origin cookie or CORS configuration is needed. Verify login, refresh, logout, and booking submission through the Vercel URL.

## Combined deployment / Docker

```sh
npm ci
npm run build
npm start
# Or, with your environment configured:
docker compose up --build -d
```

Express serves `dist/` when it exists. Production admin cookies require HTTPS at your hosting reverse proxy.

## Existing SQLite data

This change starts a new MongoDB database. It does not import existing SQLite records. Your ignored local `data/` directory is left intact as a backup. Do not delete it if you need historical bookings, reviews, or accounts; they require a separate data import. MongoDB admin credentials come from the first-run environment variables.

## Validation

```sh
npm test
npm run build
```

Integration tests start a disposable local MongoDB replica set using `mongodb-memory-server`. The first run downloads a MongoDB server binary and requires internet access. They never use your Atlas database or local `.env` credentials.
