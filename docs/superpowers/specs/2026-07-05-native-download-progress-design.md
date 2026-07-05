# Нативный прогресс скачивания файлов и CSV-экспорта аудита

Дата: 2026-07-05

## Проблема

`downloadBlob()` (`frontend/src/api/client.ts`) скачивает защищённые URL через `axios` с
`responseType: 'blob'`, чтобы приложить заголовок `Authorization` (JWT в localStorage, не
cookie). Файл целиком загружается в память, затем сохраняется через клик по `<a download>`
с `blob:`-URL. С точки зрения браузера это мгновенное сохранение готового blob — нативный
индикатор скачивания (панель загрузок) не отображает реальный прогресс сети.

Нужно, чтобы для скачивания файлов (`/api/files/{id}/download`) и экспорта аудита в CSV
(`/api/audit/export.csv`) браузер видел это как обычную сетевую загрузку и показывал
собственный прогресс.

## Почему это требует бэкенда

Нативный прогресс браузер показывает только когда сам выполняет запрос как навигацию/
скачивание (обычная ссылка, `window.location`, `<a href>` без предварительного JS-fetch).
Такой запрос не может нести кастомный заголовок `Authorization`, а сессионный JWT живёт
8 часов (`FILETRACE_JWT_EXPIRES_MINUTES=480` по умолчанию) — класть его в query string
означает, что полноценный токен доступа осядет в логах nginx и истории браузера на часы.

Решение: короткоживущий scoped-тикет для скачивания, который эндпоинты download принимают
через query-параметр вместо заголовка, а обычные защищённые эндпоинты — не принимают вовсе.

## Backend: тикет

В `app/services/security.py`:

- `create_download_ticket(user_id: int) -> str` — JWT `{sub, exp: now+60s, aud: "download"}`.
- `decode_download_ticket(token: str) -> int | None` — валидирует и требует `aud == "download"`;
  иначе `None`.
- `decode_access_token` (существующий) — должен **отвергать** токены с `aud is not None`,
  чтобы тикет нельзя было использовать как обычный `Authorization: Bearer <ticket>`.

## Backend: эндпоинты

- Новый `POST /api/auth/download-ticket` в `app/api/auth.py`, за `ActiveUser` (как остальные
  data-эндпоинты). Возвращает `{"ticket": "<jwt>"}`.
- Новая dependency `ActiveUserOrTicket` в `app/api/deps.py`:
  - если в query есть `ticket` — валидация через `decode_download_ticket`, поиск пользователя,
    проверка `is_active`/`must_change_password` как в `get_active_user`; провал → 401.
  - если `ticket` отсутствует — обычный путь через заголовок `Authorization` (без изменений).
  - обычный access-token в query **никогда** не принимается — только `ticket` с
    `aud=download`.
- Поверх неё — `AdminUserOrTicket` (та же логика, что связка `ActiveUser`/`require_admin`
  сейчас): дополнительно проверяет `role == admin`.
- Замена в эндпоинтах:
  - `GET /api/files/{file_id}/download` (`app/api/files.py`): `ActiveUser` → `ActiveUserOrTicket`
  - `GET /api/audit/export.csv` (`app/api/audit_log.py`): этот эндпоинт **уже** защищён
    `AdminUser` (экспорт аудита — только для админа), поэтому здесь замена `AdminUser` →
    `AdminUserOrTicket`, а не `ActiveUserOrTicket`.

Остальная логика этих эндпоинтов (audit.record, права на папку, фильтры экспорта) не
меняется — меняется только источник пользователя.

## Frontend

`downloadBlob()` заменяется на `triggerDownload(url: string)` в `src/api/client.ts`:

```ts
export async function triggerDownload(url: string) {
  const { data } = await api.post<{ ticket: string }>('/api/auth/download-ticket')
  const sep = url.includes('?') ? '&' : '?'
  const link = document.createElement('a')
  link.href = `${url}${sep}ticket=${encodeURIComponent(data.ticket)}`
  link.click()
}
```

`link.href` указывает прямо на бэкенд (не `blob:`), `link.download` не задаётся — браузер
выполняет обычный сетевой запрос и обрабатывает его как скачивание благодаря
`Content-Disposition: attachment`, показывая нативный прогресс. Имя файла браузер берёт из
этого же заголовка — ручной парсинг `content-disposition` на фронте (текущий код в
`downloadBlob`) убирается.

Обновляются 3 места вызова: `FileDrawer.tsx`, `BrowserPage.tsx`, `AuditPage.tsx` —
`downloadBlob(url, name)` → `triggerDownload(url)` (fallback-имя больше не нужно).

Если сессия истекла, `POST /api/auth/download-ticket` вернёт 401 → сработает существующий
axios-интерсептор (редирект на `/login`); скачивание просто не начнётся.

## Тестирование

Backend (pytest, паттерн `tests/test_files.py`):

- `POST /api/auth/download-ticket` отдаёт валидный тикет активному пользователю.
- Скачивание с `?ticket=...` вместо заголовка → 200, корректные байты, запись в `audit_log`.
- Просроченный/невалидный/с чужим `aud` тикет на скачивании → 401.
- Тикет нельзя использовать как `Authorization: Bearer <ticket>` на защищённом эндпоинте.
- Обычный заголовок `Authorization` по-прежнему работает на обоих download-эндпоинтах (нет
  регрессии для программных клиентов).
- То же для `/api/audit/export.csv`.

Frontend: ручная проверка в браузере (нативный индикатор скачивания в панели загрузок).

## Сознательно не делаем (YAGNI)

- Одноразовость тикета (можно скачать дважды за 60 секунд — не проблема для сценария).
- Привязку тикета к конкретному `file_id`/query экспорта — усложнение ради небольшого
  выигрыша безопасности при и так 60-секундном окне жизни.
