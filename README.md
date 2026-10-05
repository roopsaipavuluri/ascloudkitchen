# Cloud Kitchen / Online Food Ordering Website

A full-stack food ordering platform built with React, Express, Supabase PostgreSQL, and Supabase Storage. This project includes a customer storefront, cart and checkout flow, admin dashboard, party orders, catering requests, contact form, and secure authentication.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Authentication: JWT + bcrypt
- Database and image storage: Supabase PostgreSQL and Supabase Storage
- Styling: Responsive custom CSS

## Project Structure

- `backend/server.js` — Express API server and business logic
- `backend/db.js` — seed data and application state
- `backend/persistence.js` — Supabase persistence and local JSON development storage
- `database/supabase-schema.sql` — production PostgreSQL schema and public image bucket setup
- `database/schema.sql` — legacy MySQL schema reference; not used by the current API
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
3. For local development, leave Supabase variables blank to use the local JSON development store, or configure them in `.env` to connect to the hosted database.
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

In `/admin`, manage food items, categories, catering services, the homepage Popular This Week combo, and checkout payment details. Changes made by the API are saved to PostgreSQL before a successful response is returned. The backend reloads data from PostgreSQL on API requests, so the database is the source of truth rather than browser state. JPEG, PNG, or WebP images up to 5 MB are stored in Supabase Storage; the persistent public URL is saved with its category, product, service, or setting.

## Database Schema

Run `database/supabase-schema.sql` in the Supabase SQL Editor before starting the API. It creates relational category, food, and catering tables (including the food-to-category foreign key), JSONB detail fields for existing application-specific properties, settings and records tables, timestamps, row-level security, and the public images bucket. The API uses a server-only Supabase service key; anon/authenticated clients have no direct table write access.

## Deployment Notes

- Create a Supabase project and run `database/supabase-schema.sql` in its SQL Editor. Copy the project URL and the server-side `service_role` key from Project Settings → API.
- A Render Blueprint is provided in `render.yaml`. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET=cloud-kitchen-assets`, `ADMIN_PASSWORD`, `JWT_SECRET`, and the other secrets on the Render backend service. Never put the service-role key in Vercel or frontend environment variables. The production API refuses to start without Supabase and stable authentication secrets rather than silently falling back to temporary storage.
- After deployment, confirm `https://<render-service>.onrender.com/api/health` returns `"storage":"supabase-postgres"` and check the service logs for `Persistent storage: Supabase PostgreSQL.`
- The production frontend defaults to `https://ascloudkitchen.onrender.com/api`. If the backend URL changes, set `VITE_API_BASE_URL` in Vercel to the replacement API URL ending in `/api`, then redeploy the frontend.
- Supabase secrets belong only in Render's backend environment. Vercel should contain `VITE_API_BASE_URL` only when the backend URL differs from the default; the frontend never receives a database credential.
- `frontend/vercel.json` rewrites client-side routes such as `/admin` to the React application so direct links and refreshes work on Vercel.
- Keep `VITE_API_BASE_URL` blank for local Vite development; `vite.config.js` proxies API and image requests to `http://localhost:5000`.
- Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, and the backend's `CLIENT_URL` on the backend host. Allow the frontend origin in the backend CORS configuration.
- Keep all secrets in environment variables.
- Do not hardcode localhost URLs in production.
- For local JSON development only, state is saved under ignored `backend/data/state.json` and uploaded files under ignored `uploads/`. The hosted backend requires Supabase; it never uses local filesystem data as production persistence.

## Persistence Verification

1. Confirm the live API health endpoint reports `"storage":"supabase-postgres"`.
2. Sign in to `/admin`, change a food field, and click its Save/Update button.
3. Confirm the success message appears. The API commits the change to PostgreSQL before returning success.
4. Refresh `/admin`; confirm the saved value remains.
5. Open the public menu and confirm the same value is displayed.
6. Open the site in a private browser or another device and verify the same value appears.
7. Replace an image and confirm the new Supabase Storage URL is saved and the previous object is removed after the database update.

## Notes

The existing transient live edits that disappeared before Supabase was configured cannot be recovered from the backend; the initial Supabase database will be populated from the current project seed. Free Supabase project quotas and provider terms apply. Keep regular database backups and monitor database and storage capacity.
