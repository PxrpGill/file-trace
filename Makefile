.DEFAULT_GOAL := help

BACKEND := cd backend &&
FRONTEND := cd frontend &&

.PHONY: help setup db test lint migrate admin dev dev-backend dev-frontend build up down logs ps clean

help: ## показать список команд
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## установить зависимости backend и frontend, подключить git-хуки
	$(BACKEND) uv sync
	$(FRONTEND) npm install
	git config core.hooksPath .githooks

db: ## поднять PostgreSQL 17 для разработки (localhost:5433)
	docker compose up -d --wait db

test: ## запустить тесты backend
	$(BACKEND) uv run pytest

lint: ## проверить backend линтером ruff
	$(BACKEND) uv run ruff check .

migrate: db ## применить миграции БД
	$(BACKEND) uv run alembic upgrade head

admin: migrate ## создать администратора (make admin USER_NAME=ivan), пароль спросит интерактивно
	$(BACKEND) uv run python -m app.cli create-admin $(or $(USER_NAME),admin)

dev-backend: db ## dev-сервер API на :8000
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

down: ## остановить все контейнеры проекта (включая dev-БД)
	docker compose down

logs: ## логи прод-стека
	docker compose logs -f --tail=100

ps: ## состояние контейнеров
	docker compose ps

clean: ## удалить локальное хранилище и сборки
	rm -rf backend/storage frontend/dist
