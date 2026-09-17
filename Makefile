.PHONY: dev demo stop logs seed test lint openapi

dev:
	docker compose up --build

demo:
	sh scripts/ensure_demo_env.sh
	docker compose --profile demo run --rm seed
	docker compose up --build

stop:
	docker compose down

logs:
	docker compose logs -f api worker web

seed:
	docker compose exec -e ALLOW_DEMO_SEED=true api python -m app.seed

test:
	docker compose exec api pytest
	docker compose exec web npm test

lint:
	docker compose exec api ruff check app tests
	docker compose exec web npm run build

openapi:
	docker compose exec -T api python scripts/export_openapi.py /tmp/orphaleia-openapi.json
	docker compose cp api:/tmp/orphaleia-openapi.json /tmp/orphaleia-openapi.json
	docker compose cp /tmp/orphaleia-openapi.json web:/tmp/orphaleia-openapi.json
	docker compose exec -T web npx openapi-typescript /tmp/orphaleia-openapi.json -o src/generated/api.d.ts
