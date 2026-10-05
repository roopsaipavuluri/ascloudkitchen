# Cloud Kitchen / Online Food Ordering Website

A full-stack food ordering platform built with React, Express, and a MySQL-ready schema. This project includes a customer storefront, cart and checkout flow, admin dashboard, party orders, catering requests, contact form, and secure authentication.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Authentication: JWT + bcrypt
- Database: MySQL-compatible schema included in `database/schema.sql`
- Styling: Responsive custom CSS

## Project Structure

- `backend/server.js` — Express API server and business logic
- `backend/db.js` — in-memory data seed and state for demo use
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
3. Start the backend:
   ```bash
   npm run server
   ```
4. Start the frontend:
   ```bash
   npm --prefix frontend run dev -- --host 0.0.0.0
   ```
5. Open the app:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:5000

The seeded admin email defaults to `ascloudkitchenofficial@gmail.com`; its password is configured in `.env`. The demo customer credentials are `demo@cloudkitchen.com` / `demo123` and should only be used for local demonstration.

In `/admin`, manage food items, categories, catering services, the homepage Popular This Week combo, and checkout payment details: add/edit/delete menu items, update prices and food images, set a serving size in grams or kilograms, manage featured categories and combo title/description/price/image, and add/edit/delete catering services with image uploads and visibility controls. Catering starting prices are maintained in admin only and are not shown on the public Events & Catering page. Payment settings control checkout's COD/online choices and the UPI ID and/or QR code shown to customers. JPEG, PNG, or WebP images (up to 5 MB) are saved under `uploads/foods/`, `uploads/categories/`, `uploads/services/`, `uploads/payment/`, and `uploads/featured-combo/`. Demo catalog and payment settings use in-memory state and reset when the backend restarts; connect the existing MySQL schema before relying on persistent production catalog changes. Change the admin password before exposing a deployment publicly.

## Production / MySQL Deployment

Use MySQL in a hosted environment and import `database/schema.sql` to initialize tables. Then update the environment variables in `.env` with your database and JWT values. The application is structured so it can be migrated from its in-memory seed state to a real relational database with minimal changes.

## Deployment Notes

- A Render Blueprint is provided in `render.yaml`. In Render, create a new Blueprint from this GitHub repository and set the prompted `ADMIN_PASSWORD` to a strong private value. Render generates `JWT_SECRET` and uses the live Vercel origin for CORS. After deployment, confirm `https://<render-service>.onrender.com/api/health` returns `{"status":"ok"}`.
- In the Vercel project, add `VITE_API_BASE_URL` with the full Render API URL ending in `/api` (for example, `https://<render-service>.onrender.com/api`), then redeploy the frontend. Without this setting, production requests go to the frontend host and return 404.
- Keep `VITE_API_BASE_URL` blank for local Vite development; `vite.config.js` proxies API and upload requests to `http://localhost:5000`.
- Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, and the backend's `CLIENT_URL` on the backend host. Allow the frontend origin in the backend CORS configuration.
- Keep all secrets in environment variables.
- Do not hardcode localhost URLs in production.
- The current demo backend stores catalog, orders, payment settings, and combo data in memory, and uploaded images on local disk. Render's free service has ephemeral storage and may sleep; use persistent database and file storage before relying on admin edits or orders in production.

## Notes

This repo includes a functional demo app with a real backend and working frontend flow. For a MySQL-backed production deployment, use the included schema and configure the database connection settings in the environment.
