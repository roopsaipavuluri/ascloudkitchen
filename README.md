# Cloud Kitchen / Online Food Ordering Website

A full-stack food ordering platform built with React, Express, and a MySQL-ready schema. This project includes a customer storefront, cart and checkout flow, admin dashboard, party orders, catering requests, contact form, and secure authentication.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Authentication: JWT + bcrypt
- Database: MongoDB Atlas persistence for the live JSON-backed app state; MySQL schema also included in `database/schema.sql`
- Styling: Responsive custom CSS

## Project Structure

- `backend/server.js` — Express API server and business logic
- `backend/db.js` — seed data and application state
- `backend/persistence.js` — local JSON or MongoDB Atlas state and image persistence
- `database/schema.sql` — MySQL schema for production use
- `frontend/public/assets/cloud-kitchen-logo.jpg` — supplied Cloud Kitchen logo used across the site
- `frontend/src/` — React application files
- `frontend/vite.config.js` — Vite dev server config with API proxy
- `.env.example` — environment variable template

## Contact Details

- Phone: 8333948189
- Email: ascloudkitchenofficial@gmail.com
- Location: Guntur, Andhra Pradesh

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   npm --prefix frontend install
   ```
2. Copy environment file:
   ```bash
   copy .env.example .env
   ```
   Set `ADMIN_PASSWORD` and `JWT_SECRET` in `.env` to strong private values before starting the app. When `ADMIN_PASSWORD` is not set, the backend generates a temporary admin password and prints it once at startup.
3. (Optional for local development) Set `MONGODB_URI` in `.env` to use MongoDB Atlas. Without it, the backend saves data to `backend/data/state.json` and stores uploaded images under `uploads/`.
4. Start the backend:
   ```bash
   npm run server
   ```
5. Start the frontend:
   ```bash
   npm --prefix frontend run dev -- --host 0.0.0.0
   ```
6. Open the app:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:5000

The seeded admin email defaults to `ascloudkitchenofficial@gmail.com`; its password is configured in `.env`. The demo customer credentials are `demo@cloudkitchen.com` / `demo123` and should only be used for local demonstration.

In `/admin`, manage food items, categories, catering services, the homepage Popular This Week combo, and checkout payment details: add/edit/delete menu items, update prices and food images, set a serving size in grams or kilograms, manage featured categories and combo title/description/price/image, and add/edit/delete catering services with image uploads and visibility controls. Catering starting prices are maintained in admin only and are not shown on the public Events & Catering page. Payment settings control checkout's COD/online choices and the UPI ID and/or QR code shown to customers. JPEG, PNG, or WebP images (up to 5 MB) are supported. In local JSON mode, images are saved under `uploads/`; in MongoDB mode, application state and image bytes are stored in MongoDB Atlas. Successful API changes are saved before the server responds.

## SQL Schema Reference

`database/schema.sql` is retained as a relational schema reference. The running application currently persists its complete state and uploaded images through the MongoDB Atlas adapter described below; the MySQL schema is not connected to the API.

## Deployment Notes

- Render's free service uses ephemeral local storage, so set `MONGODB_URI` to a MongoDB Atlas connection string to keep admin edits and uploaded images through restarts and redeploys. Atlas has a no-cost shared tier; quotas and provider terms apply, so periodically export a backup. Never commit the connection string.
- For the existing Render service, create a free MongoDB Atlas cluster and database user, allow Render to connect under Atlas Network Access, then add `MONGODB_URI` under Render Dashboard → your backend service → Environment. Set `MONGODB_DATABASE` to `as_cloud_kitchen` (or keep its default), save, and redeploy. Use the Atlas connection string for the database user, not an account password. The first connection initializes the database with the current seed catalog; previously lost in-memory edits cannot be recovered by this migration.
- A Render Blueprint is provided in `render.yaml`. In Render, create a new Blueprint from this GitHub repository and set the prompted `ADMIN_PASSWORD`, `MONGODB_URI`, and other secrets to private values. Render generates `JWT_SECRET` and uses the live Vercel origin for CORS. After deployment, confirm `https://<render-service>.onrender.com/api/health` returns `"storage":"mongodb-atlas"` and check the logs for `Persistent storage: MongoDB Atlas.`
- The production frontend defaults to `https://ascloudkitchen.onrender.com/api`. If the backend URL changes, set `VITE_API_BASE_URL` in Vercel to the replacement API URL ending in `/api`, then redeploy the frontend.
- `frontend/vercel.json` rewrites client-side routes such as `/admin` to the React application so direct links and refreshes work on Vercel.
- Keep `VITE_API_BASE_URL` blank for local Vite development; `vite.config.js` proxies API and image requests to `http://localhost:5000`.
- Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, and the backend's `CLIENT_URL` on the backend host. Allow the frontend origin in the backend CORS configuration.
- Keep all secrets in environment variables.
- Do not hardcode localhost URLs in production.
- Without `MONGODB_URI`, local development stores state in a JSON file, but a hosted Render service will still lose local files on restarts or redeploys. Verify the MongoDB persistence startup log before editing live catalog data.

## Notes

This repo includes a functional demo app with a real backend and working frontend flow. For a MySQL-backed production deployment, use the included schema and configure the database connection settings in the environment.
