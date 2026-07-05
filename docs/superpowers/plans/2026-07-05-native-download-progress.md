# Нативный прогресс скачивания файлов и CSV-экспорта — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Скачивание файлов (`/api/files/{id}/download`) и экспорт аудита в CSV (`/api/audit/export.csv`) должны идти как обычная браузерная навигация, чтобы браузер показывал нативный прогресс скачивания, вместо текущего fetch+blob.

**Architecture:** Добавляем короткоживущий (60 сек) scoped JWT-тикет (`aud=download`), который download-эндпоинты принимают через `?ticket=` вместо заголовка `Authorization`. Фронтенд минтит тикет обычным авторизованным запросом, затем переходит по прямой ссылке на бэкенд (без blob), и браузер сам качает файл и показывает прогресс.

**Tech Stack:** FastAPI + PyJWT (backend, `backend/app/services/security.py`), React + TS + axios (frontend, `frontend/src/api/client.ts`).

## Global Constraints

- Тикет живёт 60 секунд, claim `aud` = `"download"`, payload как у обычного access-token (`sub`, `exp`) плюс `aud`.
- Тикет **не** привязывается к конкретному `file_id` или query экспорта (см. YAGNI в спеке) и **не** одноразовый.
- Тикет принимается **только** через query-параметр `ticket` на двух эндпоинтах: `GET /api/files/{file_id}/download` и `GET /api/audit/export.csv`. Обычный access-token через `?ticket=` не принимается.
- Обычный `Authorization`-заголовок должен продолжать работать на этих двух эндпоинтах без изменений (программные клиенты, существующие тесты).
- Спека: `docs/superpowers/specs/2026-07-05-native-download-progress-design.md`.

---

### Task 1: JWT-хелперы для download-тикета

**Files:**
- Modify: `backend/app/services/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Produces: `create_download_ticket(user_id: int) -> str`, `decode_download_ticket(token: str) -> int | None` — используются в Task 2 (эндпоинт минтинга) и Task 3 (dependency в `deps.py`).
- Consumes: существующие `settings.jwt_secret`, `settings.jwt_algorithm` из `app/config.py`.

Важный факт, проверенный вручную (`jwt.decode` без параметра `audience`): если в токене есть claim `aud`, а `audience=` в `decode()` не передан, PyJWT сам бросает `InvalidAudienceError` (подкласс `InvalidTokenError`). Это значит, что существующий `decode_access_token` **уже** отвергает токен с `aud="download"` — менять его не нужно, только добавить две новые функции и закрепить это тестом.

- [ ] **Step 1: Write the failing tests**

Добавить в конец `backend/tests/test_security.py`:

```python
from datetime import datetime, timedelta, timezone

import jwt

from app.config import settings
from app.services.security import (
    create_access_token,
    create_download_ticket,
    decode_access_token,
    decode_download_ticket,
)


def test_create_download_ticket_is_decodable():
    ticket = create_download_ticket(42)
    assert decode_download_ticket(ticket) == 42


def test_decode_download_ticket_rejects_expired():
    expired = jwt.encode(
        {
            "sub": "42",
            "aud": "download",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=5),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    assert decode_download_ticket(expired) is None


def test_decode_download_ticket_rejects_normal_access_token():
    token = create_access_token(42)
    assert decode_download_ticket(token) is None


def test_decode_access_token_rejects_download_ticket():
    ticket = create_download_ticket(42)
    assert decode_access_token(ticket) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_security.py -q`
Expected: `ImportError: cannot import name 'create_download_ticket'` (или похожая ошибка импорта) — функций ещё нет.

- [ ] **Step 3: Implement the helpers**

В `backend/app/services/security.py` добавить после `decode_access_token`:

```python
def create_download_ticket(user_id: int) -> str:
    """Short-lived, scoped JWT for browser-native downloads via ?ticket=."""
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(seconds=60),
        "aud": "download",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_download_ticket(token: str) -> int | None:
    """Returns the user id for a valid, unexpired download ticket, else None."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience="download",
        )
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_security.py -q`
Expected: `4 passed` (плюс существующие 3 теста в файле — итого 7 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/security.py backend/tests/test_security.py
git commit -m "Add scoped short-lived JWT ticket for browser downloads"
```

---

### Task 2: Эндпоинт минтинга тикета

**Files:**
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/api/auth.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Consumes: `create_download_ticket(user_id: int) -> str` (Task 1), `ActiveUser` (existing dependency), `decode_download_ticket` (Task 1, для проверки в тесте).
- Produces: `POST /api/auth/download-ticket` → `{"ticket": "<jwt>"}`. Используется фронтендом в Task 5.

- [ ] **Step 1: Write the failing tests**

Добавить в конец `backend/tests/test_auth.py`:

```python
from app.services.security import decode_download_ticket


def test_download_ticket_requires_auth(client):
    assert client.post("/api/auth/download-ticket").status_code == 401


def test_download_ticket_returns_valid_ticket_for_user(client, admin):
    headers = auth_header(client, "admin", "admin-pass")
    response = client.post("/api/auth/download-ticket", headers=headers)
    assert response.status_code == 200
    assert decode_download_ticket(response.json()["ticket"]) == admin.id


def test_download_ticket_blocked_for_must_change_password_user(client, db, user):
    user.must_change_password = True
    db.commit()
    headers = auth_header(client, "alice", "alice-pass")
    assert client.post("/api/auth/download-ticket", headers=headers).status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_auth.py -q`
Expected: `404` вместо `401`/`200`/`403` — эндпоинта ещё нет (assert failures, not errors).

- [ ] **Step 3: Implement the endpoint**

В `backend/app/schemas/auth.py` добавить в конец:

```python
class DownloadTicketResponse(BaseModel):
    ticket: str
```

В `backend/app/api/auth.py`:

```python
from app.api.deps import ActiveUser, CurrentUser, DbDep, client_ip
from app.models import AuditAction, User
from app.schemas.auth import (
    ChangePasswordRequest,
    DownloadTicketResponse,
    LoginRequest,
    LoginResponse,
    UserOut,
)
from app.services import audit
from app.services.security import (
    create_access_token,
    create_download_ticket,
    hash_password,
    verify_password,
)
```

(добавлены `ActiveUser`, `DownloadTicketResponse`, `create_download_ticket` к существующим импортам)

и новый эндпоинт (после `me`, перед `change_password` — порядок не важен):

```python
@router.post("/download-ticket", response_model=DownloadTicketResponse)
def download_ticket(user: ActiveUser) -> DownloadTicketResponse:
    return DownloadTicketResponse(ticket=create_download_ticket(user.id))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_auth.py -q`
Expected: все тесты в файле проходят (существующие + 3 новых).

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/api/auth.py backend/tests/test_auth.py
git commit -m "Add POST /api/auth/download-ticket endpoint"
```

---

### Task 3: `ActiveUserOrTicket`/`AdminUserOrTicket` и скачивание файлов через тикет

**Files:**
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/api/files.py`
- Test: `backend/tests/test_files.py`

**Interfaces:**
- Consumes: `decode_access_token`, `decode_download_ticket` (Task 1).
- Produces: `ActiveUserOrTicket`, `AdminUserOrTicket` — типы-аннотации в стиле существующих `ActiveUser`/`AdminUser`, используются в Task 3 (`files.py`) и Task 4 (`audit_log.py`).

- [ ] **Step 1: Write the failing tests**

Добавить в конец `backend/tests/test_files.py`:

```python
def test_download_with_ticket_instead_of_header(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt", b"file-content")

    ticket = client.post("/api/auth/download-ticket", headers=admin_h).json()["ticket"]
    response = client.get(f"/api/files/{body['id']}/download?ticket={ticket}")
    assert response.status_code == 200
    assert response.content == b"file-content"


def test_download_with_expired_ticket_rejected(client, admin):
    import jwt
    from datetime import datetime, timedelta, timezone

    from app.config import settings

    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    body = upload(client, admin_h, docs["id"], "a.txt")

    expired = jwt.encode(
        {
            "sub": str(admin.id),
            "aud": "download",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=5),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    response = client.get(f"/api/files/{body['id']}/download?ticket={expired}")
    assert response.status_code == 401


def test_download_ticket_cannot_be_used_as_bearer_token(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    docs = setup_folder(client, admin_h)
    upload(client, admin_h, docs["id"], "a.txt")

    ticket = client.post("/api/auth/download-ticket", headers=admin_h).json()["ticket"]
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {ticket}"})
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_files.py -q`
Expected: первые два новых теста падают с `401` вместо `200` (query `ticket` пока игнорируется, эндпоинт требует заголовок) — третий уже проходит (текущий `decode_access_token` и так отвергает `aud`), но должен остаться зелёным после рефакторинга.

- [ ] **Step 3: Implement the dependencies and wire them into the download endpoint**

В `backend/app/api/deps.py` добавить импорт `decode_download_ticket` и новые dependency после `AdminUser`:

```python
from app.services.security import decode_access_token, decode_download_ticket
```

(добавить `decode_download_ticket` к существующему импорту `decode_access_token`)

```python
def get_user_from_ticket_or_header(
    db: DbDep,
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    """Like get_current_user, but also accepts a short-lived download ticket
    via ?ticket= for browser-native downloads (see deps for ActiveUser)."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
    )
    ticket = request.query_params.get("ticket")
    if ticket is not None:
        user_id = decode_download_ticket(ticket)
    elif credentials is not None:
        user_id = decode_access_token(credentials.credentials)
    else:
        raise unauthorized
    if user_id is None:
        raise unauthorized
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def get_active_user_or_ticket(
    user: Annotated[User, Depends(get_user_from_ticket_or_header)],
) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Password change required"
        )
    return user


ActiveUserOrTicket = Annotated[User, Depends(get_active_user_or_ticket)]


def require_admin_or_ticket(user: ActiveUserOrTicket) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required"
        )
    return user


AdminUserOrTicket = Annotated[User, Depends(require_admin_or_ticket)]
```

В `backend/app/api/files.py` изменить импорт и сигнатуру `download_file`:

```python
from app.api.deps import ActiveUser, ActiveUserOrTicket, AdminUser, DbDep, StorageDep, client_ip
```

```python
@router.get("/files/{file_id}/download")
def download_file(
    file_id: int,
    db: DbDep,
    user: ActiveUserOrTicket,
    storage: StorageDep,
    request: Request,
    version_id: int | None = None,
) -> StreamingResponse:
```

(только эта функция меняет `ActiveUser` → `ActiveUserOrTicket`; `list_files`, `upload_file` и остальные остаются на `ActiveUser`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_files.py -q`
Expected: все тесты в файле проходят, включая существующий `test_download_returns_content_and_audits` (заголовочная авторизация не сломана).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/deps.py backend/app/api/files.py backend/tests/test_files.py
git commit -m "Accept download ticket on GET /api/files/{id}/download"
```

---

### Task 4: CSV-экспорт аудита через тикет

**Files:**
- Modify: `backend/app/api/audit_log.py`
- Test: `backend/tests/test_audit_api.py`

**Interfaces:**
- Consumes: `AdminUserOrTicket` (Task 3).

- [ ] **Step 1: Write the failing tests**

Добавить в конец `backend/tests/test_audit_api.py`:

```python
def test_csv_export_with_ticket(client, admin):
    admin_h = auth_header(client, "admin", "admin-pass")
    ticket = client.post("/api/auth/download-ticket", headers=admin_h).json()["ticket"]
    response = client.get(f"/api/audit/export.csv?ticket={ticket}")
    assert response.status_code == 200


def test_csv_export_ticket_requires_admin(client, user):
    alice_h = auth_header(client, "alice", "alice-pass")
    ticket = client.post("/api/auth/download-ticket", headers=alice_h).json()["ticket"]
    response = client.get(f"/api/audit/export.csv?ticket={ticket}")
    assert response.status_code == 403
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_audit_api.py -q`
Expected: `test_csv_export_with_ticket` падает с `401` (query `ticket` пока игнорируется).

- [ ] **Step 3: Implement**

В `backend/app/api/audit_log.py` изменить импорт и сигнатуру `export_csv`:

```python
from app.api.deps import ActiveUser, AdminUser, AdminUserOrTicket, DbDep
```

```python
@router.get("/audit/export.csv")
def export_csv(
    db: DbDep,
    _: AdminUserOrTicket,
    user_id: int | None = None,
    action: AuditAction | None = None,
    file_id: int | None = None,
    folder_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> StreamingResponse:
```

(только `export_csv` меняет `AdminUser` → `AdminUserOrTicket`; `journal` остаётся на `AdminUser`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_audit_api.py -q`
Expected: все тесты проходят, включая существующий `test_journal_admin_only` (заголовочная авторизация и 403 для не-админа не сломаны).

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && uv run pytest -q`
Expected: все тесты проходят (регрессия по всему backend).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/audit_log.py backend/tests/test_audit_api.py
git commit -m "Accept download ticket on GET /api/audit/export.csv"
```

---

### Task 5: Frontend — `triggerDownload` вместо `downloadBlob`

**Files:**
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/components/FileDrawer.tsx`
- Modify: `frontend/src/pages/BrowserPage.tsx`
- Modify: `frontend/src/pages/admin/AuditPage.tsx`

**Interfaces:**
- Produces: `triggerDownload(url: string): Promise<void>` — заменяет `downloadBlob(url: string, fallbackName: string): Promise<void>` во всех 3 местах вызова.

Автотестов на фронте нет (только `tsc` в `make build`, см. `package.json`). Проверка — типы + ручная проверка в браузере.

- [ ] **Step 1: Replace `downloadBlob` with `triggerDownload` in `client.ts`**

В `frontend/src/api/client.ts` заменить блок (строки 30-41):

```ts
/** Downloads a protected URL as a browser attachment, keeping the auth header. */
export async function downloadBlob(url: string, fallbackName: string) {
  const response = await api.get(url, { responseType: 'blob' })
  const disposition: string = response.headers['content-disposition'] ?? ''
  const match = disposition.match(/filename\*=UTF-8''(.+)$/)
  const name = match ? decodeURIComponent(match[1]) : fallbackName
  const link = document.createElement('a')
  link.href = URL.createObjectURL(response.data)
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
```

на:

```ts
/**
 * Downloads a protected URL as a native browser download (with progress),
 * by exchanging the session token for a short-lived download ticket first —
 * plain navigation can't carry the Authorization header, but the ticket
 * can ride in the query string safely because it expires in 60s.
 */
export async function triggerDownload(url: string) {
  const { data } = await api.post<{ ticket: string }>('/api/auth/download-ticket')
  const sep = url.includes('?') ? '&' : '?'
  const link = document.createElement('a')
  link.href = `${url}${sep}ticket=${encodeURIComponent(data.ticket)}`
  link.click()
}
```

- [ ] **Step 2: Update call sites**

В `frontend/src/components/FileDrawer.tsx`:
- строка 2: `import { api, downloadBlob } from '../api/client'` → `import { api, triggerDownload } from '../api/client'`
- строки 55-58:
```tsx
                  downloadBlob(
                    `/api/files/${file.id}/download?version_id=${v.id}`,
                    file.name,
                  )
```
→
```tsx
                  triggerDownload(`/api/files/${file.id}/download?version_id=${v.id}`)
```

В `frontend/src/pages/BrowserPage.tsx`:
- обновить импорт `downloadBlob` → `triggerDownload`
- строка 199: `downloadBlob(\`/api/files/${file.id}/download\`, file.name)` → `triggerDownload(\`/api/files/${file.id}/download\`)`

В `frontend/src/pages/admin/AuditPage.tsx`:
- обновить импорт `downloadBlob` → `triggerDownload`
- строка 41: `downloadBlob(\`/api/audit/export.csv?${query}\`, 'audit.csv')` → `triggerDownload(\`/api/audit/export.csv?${query}\`)`

- [ ] **Step 3: Type-check and build**

Run: `cd frontend && npm run build`
Expected: сборка проходит без ошибок TypeScript (в частности, нет неиспользуемых импортов `downloadBlob`, нигде не осталось ссылок на удалённую функцию — проверить `grep -rn downloadBlob frontend/src` вернёт пусто).

- [ ] **Step 4: Manual verification in browser**

1. `make db && make migrate && make admin USER_NAME=admin` (если ещё не сделано), `make dev`.
2. Открыть приложение, залогиниться под admin.
3. Загрузить файл размером в несколько МБ (чтобы скачивание не было мгновенным), нажать «Скачать» на странице списка файлов и в `FileDrawer` (конкретная версия) — убедиться, что браузер показывает собственный индикатор загрузки (иконка в панели инструментов/страница загрузок), а не просто мгновенно сохраняет файл.
4. На странице аудита (`/admin/audit` или соответствующий роут) нажать «Экспорт CSV» — файл должен скачаться так же, через нативный прогресс.
5. Проверить, что имя скачанного файла корректное (браузер берёт его из `Content-Disposition`, выставляемого бэкендом).
6. Проверить сценарий истёкшей сессии: разлогиниться (или удалить токен в localStorage) и нажать «Скачать» — должен сработать редирект на `/login` (как раньше), а не зависшая загрузка.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.ts frontend/src/components/FileDrawer.tsx frontend/src/pages/BrowserPage.tsx frontend/src/pages/admin/AuditPage.tsx
git commit -m "Switch downloads to native browser progress via short-lived ticket"
```
