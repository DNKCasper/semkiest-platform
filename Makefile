.PHONY: up down logs reset build shell-api shell-worker shell-web ps

up:
	docker-compose up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

reset:
	docker-compose down -v
	docker-compose up -d

build:
	docker-compose build

ps:
	docker-compose ps

shell-api:
	docker-compose exec api sh

shell-worker:
	docker-compose exec worker sh

shell-web:
	docker-compose exec web sh

lint:
	pnpm turbo lint

test:
	pnpm turbo test

typecheck:
	pnpm turbo typecheck
