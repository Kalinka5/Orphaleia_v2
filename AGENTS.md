# Repository Guidelines

Whatever action you can do yourself, Please do yourself, this includes starting apps and verification

## Project Structure & Module Organization

This repository is a two-app bookshop. `apps/api/app/` contains the FastAPI backend, SQLAlchemy models, services, security, storage, seed logic, and the background worker. Backend migrations live in `apps/api/alembic/`; API tests are in `apps/api/tests/`. `apps/web/src/` contains the React/TypeScript storefront, with browser tests in `apps/web/e2e/`, unit tests in `apps/web/src/test/`, generated API types in `apps/web/src/generated/`, static covers in `apps/web/public/covers/`, and [generated landing assets](apps/web/public/assets/landing/). Root-level Docker Compose orchestrates PostgreSQL, API, worker, web, and Mailpit.

## Build, Test, and Development Commands

- `cp .env.example .env` creates local configuration; replace secrets before deployment.
- `make dev` builds and runs the complete stack. Use `make logs` to follow services and `make stop` to shut them down.
- `make seed` reloads demo catalog data in the running API container.
- `make test` runs backend pytest and frontend Vitest suites in Docker.
- `make lint` runs Ruff and verifies the TypeScript production build.
- `cd apps/web && npm run test:e2e` runs Playwright storefront tests against the configured app.
- `make openapi` regenerates `apps/web/src/generated/api.d.ts` after API schema changes.

## Coding Style & Naming Conventions

Use four spaces and `snake_case` for Python functions/modules; use `PascalCase` for React components and `camelCase` for TypeScript values. Keep API routes under `/api/v1` and preserve the response/error shapes documented in `README.md`. Ruff enforces Python `E`, `F`, `I`, and `UP` rules; run it before committing. TypeScript is strict and must pass `npm run build`. Do not hand-edit generated API types.

### Frontend Iconography

Use `@phosphor-icons/react` for interface icons in `apps/web`. Prefer named Phosphor imports over emoji, Unicode symbols, CSS-drawn icons, or additional icon libraries whenever an equivalent icon exists. Keep icon sizes and weights consistent within each surface, mark decorative icons with `aria-hidden="true"`, and give every icon-only control an accessible label. When modifying UI that contains a Unicode stand-in, migrate that symbol to the closest Phosphor icon when practical.

### Landing Page Assets

Generated landing-page illustrations live in [apps/web/public/assets/landing/](apps/web/public/assets/landing/) and are served from `/assets/landing/`. Use slug-based filenames with paired `-featured.webp` and `-story.webp` variants, then register both variants and their descriptive alt text in `apps/web/src/landingIllustrations.ts`. Use generated editorial illustrations rather than stock imagery in the landing page's featured and collection-story surfaces. Keep the hero imagery unchanged unless a task explicitly includes it.

## Testing Guidelines

Name Python tests `test_*.py` and frontend unit tests `*.test.tsx`. Add focused tests beside the affected layer; checkout or inventory changes should cover success and failure paths. CI runs `pytest --cov=app`, Vitest, the frontend build, migrations, and an OpenAPI drift check. No numeric coverage threshold is configured, but new behavior should be exercised.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout. Use short, imperative commit subjects (for example, `Add stock reservation timeout`) and keep commits scoped. Pull requests should explain behavior and configuration changes, list verification commands, link relevant issues, and include screenshots for UI changes. Commit migrations and regenerated API types with the code that requires them.

## Security & Configuration

Never commit `.env`, credentials, payment keys, or local SQLite databases. Mock payments are the development default. Production deployments must use HTTPS, a strong `SECRET_KEY`, `COOKIE_SECURE=true`, and provider webhook secrets.
