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
- `scripts/migrate-live-admin-data.js` — one-time migration from the current live API to Supabase
- `database/supabase-schema.sql` — production PostgreSQL schema, `menu_items` migration, RLS, RPCs, and public image bucket setup
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

Run `database/supabase-schema.sql` in the SQL Editor for the **existing Supabase project**. It creates or upgrades `public.menu_items` (UUID primary key plus an internal unique `app_id` to preserve the current API's numeric food IDs), copies existing rows from `public.food_items` when present, and makes `menu_items` the source read by the application's state RPC. The food API also performs direct `SELECT`, `INSERT`, `UPDATE`, and `DELETE` operations against `menu_items`; the existing RPC continues synchronizing the wider application state and legacy relational tables. The menu table includes the requested name, description, price, category, image URL, rating, serving size, veg, featured, availability, and timestamp fields. A trigger maintains `updated_at`.

RLS is enabled on `menu_items`. Direct access for `anon` and `authenticated` is revoked; there are intentionally no public write policies. The existing Admin Panel uses the authenticated Express API, which validates the admin JWT and performs database operations using the server-only Supabase service-role key. This keeps the custom admin authentication model intact and avoids exposing privileged database credentials or granting writes to arbitrary browser users. The public website fetches menu records from the existing API, whose state is loaded from Supabase, rather than directly from seed data or browser storage.

If you have a copy of the previous backend's `state.json`, put it at `backend/data/state.json` or set `MENU_STATE_FILE` to its path, configure the local `.env` Supabase credentials, then run `npm run import:state-menu`. This idempotently imports categories and inserts menu rows by `app_id`, leaving existing matching Supabase rows unchanged. Run the SQL migration first. If the menu exists only on the still-running live API, use `npm run migrate:live-data` instead; it imports through the authenticated API and transfers available `/uploads` images. The seed catalog in `backend/db.js` is only an initial-development fallback; after initialization, Supabase-backed API reads replace it.

## Deployment Notes

- Create a Supabase project and run `database/supabase-schema.sql` in its SQL Editor. Copy the project URL and the server-side `service_role` key from Project Settings → API.
- A Render Blueprint is provided in `render.yaml`. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET=cloud-kitchen-assets`, `ADMIN_PASSWORD`, `JWT_SECRET`, and the other secrets on the Render backend service. Never put the service-role key in Vercel or frontend environment variables. The production API refuses to start without Supabase and stable authentication secrets rather than silently falling back to temporary storage.
- On the existing Render service, add `SUPABASE_URL` (the existing project's URL) and `SUPABASE_SERVICE_ROLE_KEY` (the existing project's server-only `service_role` key). Do not use `SUPABASE_ANON_KEY` for this setup: the authenticated Render API uses the service-role key for direct menu table operations and existing restricted RPCs. Keep RLS enabled; the schema revokes direct access from `anon` and `authenticated`, while the server-only service-role key is never sent to Vercel.
- Before deploying the Supabase backend over an existing live deployment, migrate its current data and `/uploads` images while the old API is still online:
  1. Put `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the ignored local `.env` file. Do not send or commit the service-role key.
  2. Run `npm run migrate:live-data` from an interactive terminal. Enter the current live admin email and password when prompted; the password prompt does not echo the password.
  3. The script fetches the live admin-managed data, moves Render `/uploads` images into Supabase Storage, and only then saves the catalog and records to Supabase. It reports an error instead of saving if a legacy image cannot be downloaded or uploaded.
  4. After it confirms success, deploy the backend. Keep the old deployment available until the migration has completed.
  5. Verify `https://ascloudkitchen.onrender.com/api/health` returns `"storage":"supabase-postgres"`, then refresh the admin and customer pages and check that the migrated data and images appear.
- The migration preserves users already in Supabase and updates the admin record to the live admin email/password. Existing customer account passwords from the old deployment cannot be migrated through its sanitized customer API; customers may need to register again or use the existing password-reset process. The legacy notifications API exposes only its newest 20 items.
- After deployment, confirm `https://<render-service>.onrender.com/api/health` returns `"storage":"supabase-postgres"` and check the service logs for `Persistent storage: Supabase PostgreSQL.`
- The production frontend defaults to `https://ascloudkitchen.onrender.com/api`. If the backend URL changes, set `VITE_API_BASE_URL` in Vercel to the replacement API URL ending in `/api`, then redeploy the frontend.
- Supabase secrets belong only in Render's backend environment. Vercel should contain `VITE_API_BASE_URL` only when the backend URL differs from the default; the frontend never receives a database credential. Do not add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, or any service-role key for this architecture. The project uses its existing API as the secure Supabase boundary.
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

The existing transient live edits that disappeared before Supabase was configured cannot be recovered. The migration utility transfers records currently available through the live admin API; any image files already removed from the old host cannot be restored. Free Supabase project quotas and provider terms apply. Keep regular database backups and monitor database and storage capacity.
