# Ihinga Backend

Backend foundation for the Ihinga agriculture activities system, built with plain JavaScript, Express, and PostgreSQL.

## Requirements

- Node.js and npm
- A running PostgreSQL server and an `ihinga` database

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL` in `.env` to your PostgreSQL connection string.
4. Start the development server with `npm run dev`.

The API listens on port `3000` by default. Set `PORT` in `.env` to change it.

## Health endpoints

- `GET /api/health` checks that the API process is responding.
- `GET /api/health/ready` checks that the API can query PostgreSQL.

Authentication and agriculture features will be added separately.
