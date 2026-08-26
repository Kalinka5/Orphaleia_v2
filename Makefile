.PHONY: dev stop logs seed test lint openapi

dev:
	docker compose up --build

stop:
	docker compose down

logs:
	docker compose logs -f api worker web

seed:
	docker compose exec api python -m app.seed

test:
	docker compose exec api pytest
	docker compose exec web npm test

lint:
	docker compose exec api ruff check app tests
	docker compose exec web npm run build

openapi:
	docker compose exec web npm run openapi

