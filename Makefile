.PHONY: setup dev up down seed lint test build clean

setup:
	corepack enable
	pnpm install --frozen-lockfile

dev:
	pnpm dev

up:
	docker compose up --build -d

down:
	docker compose down

seed:
	docker compose run --rm migrate pnpm db:seed

lint:
	pnpm format:check
	pnpm lint
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

clean:
	docker compose down --volumes --remove-orphans
