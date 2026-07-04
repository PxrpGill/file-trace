# File-Trace

Корпоративное хранилище файлов любых форматов с полным аудитом электронных следов:
каждое создание, скачивание, изменение и удаление фиксируется в неизменяемом журнале.

## Возможности

- **Файлы и папки** — дерево папок, загрузка (в т.ч. drag-and-drop), скачивание, переименование, перемещение.
- **Версионирование** — «редактирование» = загрузка новой версии; вся история версий хранится, любую можно скачать. Для каждой версии сохраняется sha256.
- **Аудит** — append-only журнал: вход (включая неудачные попытки), загрузка, скачивание, новые версии, переименования, перемещения, удаления, действия с пользователями и правами. У каждой записи: кто, когда, с какого IP, над чем.
  - Администратор видит весь журнал с фильтрами (пользователь, действие, период) и экспортом в CSV.
  - Пользователь видит историю каждого доступного ему файла.
- **Права доступа** — администратор выдаёт права `чтение`/`чтение и изменение` на папку; право действует на всё поддерево, ближайшее явное право приоритетнее. Пользователи видят только доступные папки.
- **Корзина** — удаление мягкое; администратор восстанавливает или удаляет окончательно.
- **Аккаунты** — самостоятельной регистрации нет; пользователей заводит администратор, при первом входе обязательная смена пароля. Пароли — argon2, сессии — JWT.

## Стек

FastAPI + SQLAlchemy + PostgreSQL (метаданные и журнал), файлы на диске за абстракцией
`FileStorage` (готово к замене на S3), React + TypeScript + Vite, nginx, docker-compose.

## Запуск (production)

```bash
cp .env.example .env        # задайте JWT_SECRET и POSTGRES_PASSWORD
make up                     # docker compose up -d --build

# первичный администратор
docker compose exec backend uv run python -m app.cli create-admin admin --full-name "Администратор"
```

Интерфейс: http://localhost:8080 (порт меняется переменной `HTTP_PORT`).

## Разработка

Через Makefile (см. `make help`):

```bash
make setup      # зависимости backend (uv) и frontend (npm)
make admin      # поднимает dev-БД, применяет миграции, создаёт администратора
make dev        # оба dev-сервера: API на :8000, UI на :5173
make test       # pytest backend
```

Разработка использует тот же PostgreSQL 17, что и прод: `make db` поднимает его в Docker
на `localhost:5433` (порт меняется переменной `POSTGRES_PORT`). Вручную:

```bash
# backend (Python 3.12+, uv; PostgreSQL должен быть запущен — make db)
cd backend
uv sync
uv run alembic upgrade head
uv run python -m app.cli create-admin admin
uv run uvicorn app.main:app --port 8000 --reload

# frontend
cd frontend
npm install
npm run dev                                # http://localhost:5173, /api проксируется на :8000
```

Тесты не требуют Docker — они работают на изолированной in-memory базе (sqlite)
ради скорости; совместимость схемы с PostgreSQL обеспечивают миграции Alembic.

Настройки backend берутся из переменных окружения с префиксом `FILETRACE_`
(`DATABASE_URL`, `STORAGE_ROOT`, `JWT_SECRET`, `JWT_EXPIRES_MINUTES`) или файла `backend/.env`.

## Тесты

```bash
cd backend
uv run pytest
```

Каждое действие покрыто тестами вместе со своей записью аудита; отдельно проверяются
запреты доступа (нет права — 403, папка не видна в дереве).

## Структура

```
backend/
  app/
    api/        # роутеры: auth, users, folders, permissions, files, audit_log
    models/     # User, Folder, File, FileVersion, FolderPermission, AuditLog
    services/   # storage (диск/S3-абстракция), audit (единственная точка записи), permissions
    cli.py      # create-admin
  alembic/      # миграции
  tests/
frontend/
  src/
    auth/       # вход, смена пароля
    pages/      # файловый менеджер, админ-панель (пользователи, права, корзина, журнал)
    components/ # дерево папок, карточка файла с версиями и историей
```
