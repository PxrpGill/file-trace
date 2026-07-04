# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## О проекте

File-Trace — внутреннее корпоративное хранилище файлов, главная фича — аудит «электронных следов»: каждое действие (вход, загрузка, скачивание, новая версия, переименование, удаление, выдача прав…) пишется в append-only журнал `audit_log`. Язык общения с пользователем и все UI-тексты — русский.

## Команды

```bash
make db          # PostgreSQL 17 в Docker на localhost:5433 (нужен для dev-сервера и alembic)
make dev         # оба dev-сервера: API :8000 (uvicorn --reload), UI :5173 (vite)
make test        # все тесты backend
make migrate     # alembic upgrade head
make admin       # создать администратора (USER_NAME=ivan)
make up / down   # прод-стек (nginx :8080 + backend + postgres)
```

Один тест / один файл (тесты Docker не требуют — sqlite in-memory):

```bash
cd backend && uv run pytest tests/test_files.py -q
cd backend && uv run pytest tests/test_files.py::test_soft_delete_restore_flow
```

Проверка типов и сборка фронтенда: `make build` (= `tsc -b && vite build`). Линтера в backend нет.

После изменения моделей: `cd backend && FILETRACE_DATABASE_URL="sqlite:///$(mktemp -d)/mig.db" uv run alembic revision --autogenerate -m "..."` — затем проверить сгенерированный файл (автогенерация может вставить `Text()` без импорта) и прогнать `upgrade head`.

## Архитектура

Монорепозиторий: `backend/` (FastAPI + SQLAlchemy 2.x, sync) и `frontend/` (React + TS + Vite, tanstack-query). В dev vite проксирует `/api` на :8000; в прод nginx (frontend/nginx.conf) проксирует `/api/` на backend и передаёт `X-Real-IP`, который `client_ip()` в `app/api/deps.py` предпочитает адресу сокета.

### Инварианты аудита (главное, что нельзя сломать)

- **Единственная точка записи** — `app/services/audit.py: record()`. Никогда не создавать `AuditLog` напрямую и не делать эндпоинтов на изменение/удаление записей журнала.
- `record()` только добавляет запись в сессию; **коммитит вызывающий эндпоинт** — действие и его след атомарны в одной транзакции.
- Каждый новый эндпоинт, меняющий состояние, обязан писать аудит и иметь тест, который проверяет и результат, и запись в `audit_log` (см. паттерн в `tests/test_files.py`).
- `AuditLog` ссылается на файлы/папки «мягко» (без FK-каскадов) — записи переживают удаление объектов (purge).

### Модель прав

`app/services/permissions.py`. Право (`read`/`write`) выдаётся на папку и действует на всё поддерево; при нескольких явных правах по цепочке предков побеждает ближайшее. Админ имеет write везде неявно. Доступ к файлу = доступ к его папке. Для эндпоинтов: `require_folder_access(db, user, folder_id, level)` (403/404), для дерева — `accessible_levels()`. Корневые папки создаёт только админ.

Цепочка зависимостей в `deps.py`: `get_current_user` (JWT) → `get_active_user` (блокирует аккаунты с `must_change_password` — поэтому смена пароля и `/me` используют `CurrentUser`, всё остальное `ActiveUser`) → `require_admin`.

### Файлы и версии

Байты лежат на диске за протоколом `FileStorage` (`app/services/storage.py`); БД знает только `storage_key` (uuid hex, раскладка `root/key[:2]/key`). «Редактирование» = новая `FileVersion`; текущая версия — свойство `File.current_version` (последняя по `version_no`), отдельной FK-колонки нет. Удаление файла мягкое (`is_deleted`), восстановление/окончательное удаление — только админ; папка удаляется только пустая (409). При создании версии связывать через relationship (`FileVersion(file=file, ...)`), иначе ответ сериализуется со старым списком версий.

### Тесты

`tests/conftest.py`: sqlite in-memory (StaticPool) + подмена `get_db` и `get_storage` (tmp_path); фикстуры `admin` (admin-pass) и `user` (alice/alice-pass). Тестовые хелперы шарятся импортом между файлами (`auth_header` из test_auth, `make_folder`/`grant` из test_folders). Схема кросс-СУБД: enum'ы с `native_enum=False`, JSON с variant JSONB — сохранять этот стиль в новых колонках.

### Frontend

Токен в localStorage, axios-интерсепторы в `src/api/client.ts` (401 → редирект на /login); скачивание защищённых URL — только через `downloadBlob()` (сохраняет Authorization). Метки времени бэкенд может отдавать без зоны (sqlite) — всё форматирование дат через `formatDate()` в `src/api/types.ts`, который дописывает `Z`. Подписи действий аудита — словарь `ACTION_LABELS` там же: новое действие enum'а требует добавления перевода. Дизайн-токены — в `src/styles.css` (:root): чернильный `--ink`, сургучный акцент `--wax`, mono-шрифт для «следов» (время/хэши/размеры).

### Конфигурация

`app/config.py` — pydantic-settings, префикс `FILETRACE_` (env или `backend/.env`): `DATABASE_URL` (по умолчанию postgres на localhost:5433), `STORAGE_ROOT`, `JWT_SECRET`, `JWT_EXPIRES_MINUTES`. Прод-переменные compose: `JWT_SECRET`, `POSTGRES_PASSWORD`, `HTTP_PORT`, `POSTGRES_PORT` (см. `.env.example`).
