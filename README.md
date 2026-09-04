# Orphaleia Book Shop

An Odyssey-inspired physical book shop built with FastAPI, React, PostgreSQL, Stripe, and PayPal. The repository includes the customer storefront, reader accounts, yearly rating history, comments, checkout, a staff console, image storage, a background worker, transactional email, and original demo content.

## Run the complete shop

1. Copy the environment file: `cp .env.example .env`.
2. Replace `SECRET_KEY` and, if desired, the seeded admin password.
3. Start everything: `docker compose up --build`.
4. Open the shop at <http://localhost:5173>, API docs at <http://localhost:8010/docs>, and development email at <http://localhost:8025>.

The Docker API host port defaults to `8010` to avoid common local port collisions; set `API_PORT` in `.env` if you prefer another port. Services inside Docker continue to use port `8000`.

The first API startup applies migrations and seeds the catalog. Demo credentials:

- Admin: `admin@orphaleia.local` / `Orphaleia!2026` (or the values in `.env`)
- Reader: `reader@orphaleia.local` / `ReaderPass!2026`

Payments run in safe mock mode by default. Both checkout buttons complete the full order, inventory, email, and cart-clearing flow without charging money.

## Local development without Docker

Backend (Python 3.12 recommended):

```sh
cd apps/api
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
```

Frontend:

```sh
cd apps/web
npm install
npm run dev
```

Run `pytest` in `apps/api` and `npm test && npm run build` in `apps/web`.

## Real payment providers

Set `PAYMENTS_MOCK=false` and configure the relevant keys in `.env`.

- Stripe: create a Checkout-enabled account, set `STRIPE_SECRET_KEY`, register `/api/v1/webhooks/stripe`, and set `STRIPE_WEBHOOK_SECRET`. Listen for `checkout.session.completed`.
- PayPal: use sandbox REST application credentials for `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, register `/api/v1/webhooks/paypal`, set `PAYPAL_WEBHOOK_ID`, and subscribe to `PAYMENT.CAPTURE.COMPLETED`. Change `PAYPAL_BASE_URL` only when moving to PayPal production.

Use HTTPS and `COOKIE_SECURE=true` in deployed environments. Refunds are made in the provider dashboard and reconciled through the admin order status, as defined for this MVP.

## Media, email, and deployment

Development images are stored in the `media_data` Docker volume. For production, set the S3-compatible variables; uploads automatically switch to object storage. Email is written through an SMTP outbox and retried by the worker. Local email is captured at <http://localhost:8025> and is not forwarded to real inboxes.

For real delivery, replace the Mailpit defaults with the SMTP server of your transactional email provider. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USERNAME`, and `SMTP_PASSWORD`; set `SMTP_STARTTLS=true` when the provider uses STARTTLS (commonly port 587). Set `MAIL_PREVIEW_URL=` outside development so the storefront does not offer a local-inbox link.

The production web image is an Nginx-served static build that proxies API and media paths to the FastAPI service. Run migrations as a release step, run one or more API containers, and keep exactly one reservation/email worker active unless adding worker-level locking.

Prices are stored in integer euro cents and displayed VAT-inclusive. Shipping zones and free-delivery thresholds live in the database. The seeded defaults cover Spain and other EU member states.

## API conventions

All application routes are under `/api/v1`. Collection responses use `items`, `page`, `page_size`, and `total`; errors use `code`, `message`, optional `field_errors`, and `request_id`. Cookie-authenticated state-changing requests require the readable `csrf_token` cookie to be echoed in the `X-CSRF-Token` header—the web client does this automatically.
