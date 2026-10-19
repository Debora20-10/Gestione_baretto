# Project Guidelines

## Architecture

- This is a small CommonJS Node.js application. `server.js` creates the Express app, owns the MySQL connection pool, serves the API and static files, and initializes the database before listening.
- The MySQL schema for `prodotti`, `personale`, and `ordini`, the compatibility check for `metodo_pagamento`, and demo-data seeding are all in `server.js`. Seeding runs only when all three tables are empty; preserve existing data.
- `public/ordini.html` is the public order-status page and admin login, `public/menu.html` is the customer menu and checkout, and `public/index.html` is the admin page. Their browser logic is inline JavaScript; shared presentation is in `public/style.css`.
- Public endpoints under `/api/public/` serve customer-facing data. Admin pages and private data endpoints use `requireAdmin`; keep private order, staff, and management data behind that middleware and return only the fields required by public views.

## Build, Test, and Run

- Install locked dependencies with `npm ci`.
- Start the app with `npm start`; it requires a reachable MySQL database and reads optional local configuration from `.env`. See `README.md` for environment variables and database setup.
- For local development, `npm run dev` starts Docker Compose and then runs the server. To start only the database, use `docker compose up -d mysql`.
- There is no build or lint script. The current `npm test` script is a placeholder that exits with “Error: no test specified”; no single-test command or test runner is configured.

## Conventions

- Keep the existing CommonJS style and plain HTML/CSS/JavaScript approach; there is no frontend build or transpilation step.
- Use the existing Italian database table and column names and API response shapes when extending the domain.
- Use mysql2 query placeholders for values rather than interpolating user input into SQL. Use a transaction when an operation must update multiple rows atomically; public checkout locks and validates current product availability and prices in the database.
- Treat prices as authoritative server-side values. `priceInCents` converts MySQL decimal prices to integer cents for checkout calculations; do not trust prices supplied by the browser.
- Preserve the separation between public and admin APIs. Escape dynamic text before inserting it into HTML, following the `escapeHtml` helpers in the public pages.
- Keep local credentials in `.env` (ignored by Git); do not add secrets or real credentials to tracked files.
