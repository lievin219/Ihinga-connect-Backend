# Ihinga Backend

Plain JavaScript backend for the Ihinga agriculture activities system, built with Express and PostgreSQL.

## Requirements

- Node.js and npm
- PostgreSQL with an `ihinga` database
- SMTP credentials for verification, invitation, and password recovery emails

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` if you do not already have a local `.env`.
3. Configure `DATABASE_URL` for your PostgreSQL user and database.
4. Set `JWT_SECRET` to a unique random secret of at least 32 bytes. For example, generate one with `openssl rand -base64 48`.
5. Configure `APP_BASE_URL` as the frontend origin and set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `EMAIL_FROM`.
6. Apply the database schema with `npm run db:migrate`.
7. Create the first administrator with `npm run auth:create-admin`.
8. Start the development server with `npm run dev`.

The API listens on port `3000` by default. Set `PORT` in `.env` to change it. Never commit `.env` or share its secrets.

## Authentication API

All request and response bodies are JSON.

- `POST /api/auth/register` creates a farmer or customer account. Required fields: `fullName`, `phone`, `email`, `district`, `password`, and `role` (`farmer` or `customer`). Phone numbers must use international format; passwords must be at least 12 characters and no more than 72 UTF-8 bytes. A verification email is sent.
- `POST /api/auth/login` accepts `phone` and `password`, returning a 15-minute bearer access token and the user's profile. Email verification is required for password recovery, but not for login.
- `GET /api/auth/me` returns the authenticated user's profile. Send `Authorization: Bearer <accessToken>`.
- `POST /api/auth/verify-email` accepts `{ "token": "..." }` to verify an email.
- `POST /api/auth/resend-verification` accepts `{ "email": "..." }`. Its response does not reveal whether an account exists.
- `POST /api/auth/forgot-password` accepts `{ "email": "..." }`. A reset email is sent only to a verified address; the response does not reveal whether an account exists.
- `POST /api/auth/reset-password` accepts `{ "token": "...", "password": "..." }`.
- `POST /api/auth/admin/users` lets an administrator invite a `government_agent`, `government`, or `admin` account. Required profile fields are `fullName`, `phone`, `email`, `district`, and `role`; the invited user sets their password from the email link. Requires an administrator bearer token.
- `POST /api/auth/accept-invitation` accepts `{ "token": "...", "password": "..." }`.

Farmers and customers can self-register. Government and administrator roles cannot be self-selected during registration; an administrator must invite them. Create the first administrator locally with the CLI command above. Email verification and password-reset links point to the matching routes on `APP_BASE_URL`; the frontend should read the `token` query parameter and submit it to the API endpoint listed above.

## Crop listings API

Crop listings can be browsed without signing in. Contact details require a valid bearer access token. Only farmer accounts can create, update, and delete their own listings.

- `GET /api/crops` publicly lists available crops. Optional query parameters: `search`, `district`, `limit` (default 20, maximum 100), and `offset` (default 0).
- `GET /api/crops/:cropId` publicly returns an available listing without the farmer's phone number.
- `GET /api/crops/:cropId/contact` returns the farmer's name, phone, and district to any signed-in user.
- `GET /api/crops/mine` returns all listings belonging to the signed-in farmer, including unavailable listings.
- `POST /api/crops` creates a listing. Required JSON fields: `cropName`, `quantityAvailable`, and `unit`. Optional `pricePerUnitRwf` is the asking price in Rwandan francs per unit.
- `PATCH /api/crops/:cropId` updates one or more of `cropName`, `quantityAvailable`, `unit`, `pricePerUnitRwf`, and `isAvailable`. Send `null` for `pricePerUnitRwf` to remove the asking price.
- `DELETE /api/crops/:cropId` deletes a listing owned by the signed-in farmer.

Quantities support up to three decimal places; asking prices support up to two. The unit is farmer-defined (for example `kg`, `bag`, or `crate`). Decimal values are returned as strings to preserve precision.

## Health endpoints

- `GET /api/health` checks that the API process is responding.
- `GET /api/health/ready` checks that the API can query PostgreSQL.

## Tests

Run the validation tests with `npm test`.
