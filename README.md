# Orphaleia Book Shop

An Odyssey-inspired physical book shop built with FastAPI, React, PostgreSQL, Stripe, and PayPal. The repository includes the customer storefront, reader accounts, yearly rating history, comments, checkout, a staff console, image storage, a background worker, transactional email, and original demo content.

## Run the complete shop

1. Run `make demo` to create an ignored local environment with generated secrets, seed the demo catalog, and start the stack with mock payments.
2. Open the shop at <http://localhost:5173>, API docs at <http://localhost:8010/docs>, and development email at <http://localhost:8025>.

The Docker API host port defaults to `8010` to avoid common local port collisions; set `API_PORT` in `.env` if you prefer another port. Demo-facing API, web, and Mailpit ports bind to loopback only. Services inside Docker continue to use their normal container ports.

Normal `make dev` uses an existing configuration and never creates privileged users or demo data implicitly. Demo credentials are printed once when `make demo` creates `.env`; the reader account remains:

- Reader: `reader@orphaleia.local` / `ReaderPass!2026`

The explicit demo profile runs payments in mock mode. Production configuration fails closed unless PostgreSQL, HTTPS, secure cookies, Redis, trusted proxy CIDRs, live Stripe/PayPal settings, and non-placeholder secrets are supplied.

## Local development without Docker

Backend (Python 3.12 recommended):

```sh
cd apps/api
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
ALLOW_DEMO_SEED=true APP_ENV=development python -m app.seed
uvicorn app.main:app --reload --no-proxy-headers
```

Frontend:

```sh
cd apps/web
npm install
npm run dev
```

Run `pytest` in `apps/api` and `npm test && npm run build` in `apps/web`.

## Real payment providers

Set `PAYMENTS_MOCK=false` and configure both providers in `.env`.

- Stripe: create a Checkout-enabled account, set `STRIPE_SECRET_KEY`, register `/api/v1/webhooks/stripe`, and set `STRIPE_WEBHOOK_SECRET`. Listen for `checkout.session.completed` and `checkout.session.async_payment_succeeded`; fulfillment occurs only after Stripe reports `payment_status=paid`.
- PayPal: use live REST application credentials for `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`, register `/api/v1/webhooks/paypal`, set `PAYPAL_WEBHOOK_ID`, and subscribe to `PAYMENT.CAPTURE.COMPLETED`.

Use HTTPS and `COOKIE_SECURE=true` in deployed environments. Refunds are made in the provider dashboard and reconciled through the admin order status, as defined for this MVP.

## Media, email, and deployment

Development images are stored in the `media_data` Docker volume. For production, set the S3-compatible variables; uploads automatically switch to object storage. Email is written through an SMTP outbox and retried by the worker. Local email is captured at <http://localhost:8025> and is not forwarded to real inboxes.

For real delivery, replace the Mailpit defaults with the SMTP server of your transactional email provider. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USERNAME`, and `SMTP_PASSWORD`; set `SMTP_STARTTLS=true` when the provider uses STARTTLS (commonly port 587). Set `MAIL_PREVIEW_URL=` outside development so the storefront does not offer a local-inbox link.

The production web image is an Nginx-served static build that proxies API and media paths to the FastAPI service. Run migrations as a release step, run one or more API containers, and keep exactly one reservation/email worker active unless adding worker-level locking.

Prices are stored in integer euro cents and displayed VAT-inclusive. Shipping zones and free-delivery thresholds live in the database. The seeded defaults cover Spain and other EU member states.

## API conventions

All application routes are under `/api/v1`. Collection responses use `items`, `page`, `page_size`, and `total`; errors use `code`, `message`, optional `field_errors`, and `request_id`. Cookie-authenticated state-changing requests require the readable `csrf_token` cookie to be echoed in the `X-CSRF-Token` header—the web client does this automatically.

Reader account controls live at `/account`: Orders remains the default view and provides a timestamped fulfilment timeline with carrier tracking, while Profile manages the public display name and avatar and Security manages email and password changes. Staff advance paid orders through Preparing, Shipped, Out for delivery, and Delivered from the admin console; confirmation, shipment, delivery, cancellation, and recorded-refund milestones queue transactional email. Avatar uploads are normalized to 256×256 WebP files in the configured media store. Email changes remain pending until the new address is confirmed; confirmed email changes sign out every device, while password changes keep only the requesting device signed in.
