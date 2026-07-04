.DEFAULT_GOAL := help

BACKEND := cd backend &&
FRONTEND := cd frontend &&

.PHONY: help setup test migrate admin dev dev-backend dev-frontend build up down logs ps clean

help: ## показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## установить зависимости backend и frontend
	$(BACKEND) uv sync
	$(FRONTEND) npm install

test: ## запустить тесты backend
	$(BACKEND) uv run pytest

migrate: ## применить миграции БД (dev: sqlite ./backend/filetrace.db)
	$(BACKEND) uv run alembic upgrade head

admin: migrate ## создать администратора (make admin USER_NAME=ivan), пароль спросит интерактивно
	$(BACKEND) uv run python -m app.cli create-admin $(or $(USER_NAME),admin)

dev-backend: ## dev-сервер API на :8000
	$(BACKEND) uv run uvicorn app.main:app --port 8000 --reload

dev-frontend: ## dev-сервер UI на :5173 (проксирует /api на :8000)
	$(FRONTEND) npm run dev

dev: ## запустить оба dev-сервера (Ctrl+C останавливает оба)
	@trap 'kill 0' INT TERM; \
	$(MAKE) dev-backend & \
	$(MAKE) dev-frontend & \
	wait

build: ## собрать frontend (проверка типов + прод-бандл)
	$(FRONTEND) npm run build

up: ## поднять прод-стек в Docker (нужен .env с JWT_SECRET)
	docker compose up -d --build

down: ## остановить прод-стек
	docker compose down

logs: ## логи прод-стека
	docker compose logs -f --tail=100

ps: ## состояние контейнеров
	docker compose ps

clean: ## удалить dev-базу, хранилище и сборки
	rm -rf backend/filetrace.db backend/dev.db backend/storage frontend/dist
