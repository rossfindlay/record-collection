# Record Collection

A full-stack app for browsing your Discogs record collection and Spotify listening history.

**Architecture:** Next.js frontend on Vercel + Express/Prisma API on Railway (PostgreSQL).

Deploy Railway **first** so you have the API URL ready when configuring Vercel.

---

## 1. Railway (Backend + Database)

### 1a. Create the project

1. Go to [railway.app](https://railway.app) and create a new project.
2. Click **Deploy from GitHub repo** and select this repository.
3. When prompted for the root directory, set it to **`server`**.

### 1b. Add PostgreSQL

1. Inside the project, click **+ New** → **Database** → **PostgreSQL**.
2. Railway automatically creates and injects `DATABASE_URL` into the service — you don't need to set it manually.

### 1c. Set environment variables

In the **service** (not the database), open **Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `ENCRYPTION_KEY` | *(random string)* | Run `openssl rand -base64 32` to generate. Must be ≥ 32 chars. |
| `CORS_ORIGIN` | `https://<your-app>.vercel.app` | Your Vercel frontend URL. You can update this after deploying Vercel. |
| `NODE_ENV` | `production` | Enables secure cookies. |

> `PORT` and `DATABASE_URL` are injected automatically — do **not** set them yourself.

### 1d. Configure the build & start commands

Railway should detect these automatically from `server/package.json`, but verify under **Settings → Build & Deploy**:

- **Build command:** `npm run build`
- **Start command:** `npm run start`

`npm run build` runs `prisma generate && prisma migrate deploy && tsc`, so the database schema is applied on every deploy.

### 1e. Get your API URL

After the first successful deploy, copy the public URL from the Railway dashboard (e.g. `https://record-collection-api.up.railway.app`). You'll need this for Vercel.

---

## 2. Vercel (Frontend)

### 2a. Import the project

1. Go to [vercel.com](https://vercel.com) and click **Add New → Project**.
2. Import this GitHub repository.
3. Vercel will detect Next.js automatically.
4. Leave the **Root Directory** as `/` (the repo root).

### 2b. Set environment variables

In the **Environment Variables** section during import (or later under **Settings → Environment Variables**):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<your-railway-service>.up.railway.app` |

Set this for **Production**, **Preview**, and **Development** environments (or just Production if preferred).

### 2c. Deploy

Click **Deploy**. Vercel runs `npm run build` and `npm run start` automatically.

---

## 3. Finish wiring up CORS

Once Vercel assigns your frontend URL (e.g. `https://record-collection.vercel.app`):

1. Go back to your Railway service → **Variables**.
2. Set `CORS_ORIGIN` to the exact Vercel URL (no trailing slash).
3. Railway will redeploy automatically.

---

## Local Development

```bash
# Backend
cp server/.env.example server/.env
# Edit server/.env with a local DATABASE_URL and ENCRYPTION_KEY
cd server && npm install && npm run dev

# Frontend (in a separate terminal)
cp .env.example .env.local
# .env.local: NEXT_PUBLIC_API_URL=http://localhost:8080
npm install && npm run dev
```

---

## Environment Variable Reference

### Frontend (Vercel)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Yes | Full URL of the Railway API (no trailing slash) |

### Backend (Railway)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Auto-injected by Railway when PostgreSQL is linked |
| `ENCRYPTION_KEY` | Yes | AES-256-GCM key for encrypting stored tokens. Generate: `openssl rand -base64 32` |
| `CORS_ORIGIN` | Yes | Vercel frontend URL, e.g. `https://record-collection.vercel.app` |
| `PORT` | No | Auto-set by Railway (default 8080) |
| `NODE_ENV` | Recommended | Set to `production` to enable secure/httpOnly cookies |
