# Паттерны разработки file-trace

Это дополнение к корневому `CLAUDE.md` — конкретные, подсмотренные в коде
шаблоны того, «как здесь пишут код», плюс места, где `CLAUDE.md` разошёлся
с реальным кодом (фронтенд был переведён на FSD, часть путей/имён устарела).

> Пути фронтенда в корневом `CLAUDE.md` актуализированы под FSD
> 2026-07-08 (были расхождения после перехода со плоской структуры —
> `downloadBlob()` → `triggerDownload()`, `src/api/types.ts` →
> `shared/lib/format-date.ts` / `entities/audit/model/action-labels.ts`).
> Если снова найдёшь расхождение между `CLAUDE.md` и кодом — почини оба
> файла, не только этот.

## Backend: шаблон эндпоинта, меняющего состояние

Все мутирующие эндпоинты в `app/api/*.py` следуют одной форме (см.
`app/api/files.py` как эталон):

```python
@router.post("/...", response_model=SomeOut, status_code=status.HTTP_201_CREATED)
def do_thing(..., db: DbDep, user: ActiveUser, request: Request) -> SomeModel:
    obj = require_folder_access(db, user, folder_id, PermissionLevel.write)  # или _get_file()
    # ...изменение состояния...
    audit.record(
        db, AuditAction.some_action,
        user_id=user.id, file_id=..., folder_id=..., ip=client_ip(request),
        details={...},  # достаточно контекста, чтобы восстановить «что произошло» из одной записи
    )
    db.commit()  # коммитит эндпоинт, не record() — действие и след атомарны
    return obj
```

Ключевые моменты:
- Проверка доступа — **всегда** первой строкой, до любого изменения состояния.
- `_get_file(db, user, file_id, level, include_deleted=False)` — приватный
  хелпер модуля для «найти файл + проверить доступ», не дублировать вручную.
- Массовые операции (`bulk_move`, `bulk_delete`, ...) используют
  `_resolve_bulk_files()` → возвращает `(ok, failed)`, где `failed` несёт
  `reason` (`"not_found"` / `"forbidden"`) — фронт показывает `skipped`
  пользователю, а не тихо молчит про часть файлов.
- Чтения (`list_files`, `search_files`) **не** пишут аудит — audit фиксирует
  действия, а не то, что уже раскрывается просмотром папки. Если сомневаешься,
  писать ли audit для нового read-эндпоинта — смотри на этот прецедент и
  комментарий в `search_files`.
- Ошибки — `HTTPException` с конкретным `status_code`, `detail` на русском,
  если текст увидит пользователь (напр. «Формат не поддерживается для
  предпросмотра»), на английском — если это internal/техническое (напр.
  «File not found», «Version not found» — эти пока не переведены, не повод
  менять существующие, но для новых эндпоинтов ориентируйся на то, что уже
  видит юзер в UI).

## Backend: тесты

- Один тестовый файл на роутер/фичу: `test_files.py`, `test_folders.py`,
  `test_archive.py` и т.д. Хелперы **не дублируются**, а импортируются
  между файлами: `from tests.test_auth import auth_header`,
  `from tests.test_folders import grant, make_folder`.
- Паттерн теста: поднять актёров через фикстуры `admin`/`user` →
  `auth_header(client, username, password)` → выполнить запрос →
  проверить И результат ответа, И запись в `db.query(AuditLog)`.
  Каждый новый мутирующий эндпоинт обязан иметь тест обеих частей
  (см. `test_upload_creates_file_with_version_and_audit`).
- БД — sqlite in-memory с `StaticPool` (см. `conftest.py`), `get_db`/
  `get_storage` подменены оверрайдами `app.dependency_overrides`. Не нужен
  Docker для запуска `uv run pytest`.
- Локальный маленький хелпер вида `upload(client, headers, folder_id, name, content=..., expect=201)`
  на верху тестового файла — общий паттерн: обёртка над повторяющимся
  запросом с параметром `expect` для ожидаемого статуса, а не отдельная
  функция на каждый код ответа.

## Frontend: анатомия одной фичи (FSD `features/`)

Каждое действие пользователя — отдельная папка `features/<domain>/<action>/`
с фиксированной структурой и re-export через `index.ts`:

```
features/file/rename-move-file/
  index.ts            # export { useUpdateFileMutation } from './model/use-update-file'
  model/use-update-file.ts   # useMutation-хук: mutationFn + onSuccess: invalidateQueries
  ui/RenameFileAction.tsx    # компонент, использующий хук
```

- Хук — тонкая обёртка над `useMutation` из tanstack-query: `mutationFn`
  зовёт `api.<method>(url, body)` из `@/shared/api`, `onSuccess` инвалидирует
  релевантные query keys (`['tree']`, `['files']` и т.п.) — **не** делает
  ручной рефетч/сеттинг кэша руками.
  Так как эндпоинт уже пишет аудит и коммитит транзакцию на бэкенде,
  фронту достаточно инвалидировать кэш — дополнительный аудит-запрос
  не нужен.
- Импорты между слоями — только через паблик `index.ts` слоя
  (`@/shared/api`, `@/entities/file`, ...), не вглубь чужого модуля.
- Простые UI-элементы (`UploadFileButton.tsx`) — controlled/uncontrolled
  обёртки без сайд-эффектов: принимают callback пропом (`onFilesSelected`),
  сами ничего не мутируют и не дергают API — вызов мутации остаётся в
  родительском виджете/странице.

## Git / рабочий процесс

История коммитов показывает устойчивый цикл на фичу (совпадает со
skill'ами `superpowers:writing-plans` / `subagent-driven-development`,
уже применявшимися в проекте — см. `.superpowers/sdd/progress.md`):

```
docs: спек <фичи>                      — спецификация
docs: план реализации <фичи>           — пошаговый план
feat: <task 1>
feat: <task 2>
fix: <мелкие правки после ревью>
Merge branch '<feature-branch>'
```

Сообщения коммитов — `type: текст на русском` (`feat`, `fix`, `docs`),
тип на английском, описание на русском, в повелительном наклонении
короткой фразой («добавить», «исправить», «сделать»), без точки в конце.

`.superpowers/sdd/progress.md` — living-документ на время работы над
веткой: ledger по тасками с найденными минорными замечаниями и что из
них уже закрыто/сознательно отложено на потом. Стоит проверять его,
если продолжаешь фичу, начатую в предыдущей сессии.

## Модели/схемы

- Новый `AuditAction` в `app/models/audit.py` требует парного перевода в
  `ACTION_LABELS` (см. расхождение выше про путь) — иначе на фронте будет
  «дыра» в подписи действия в журнале аудита.
- `FileVersion` всегда создаётся через relationship `FileVersion(file=file, ...)`,
  а не проставлением `file_id=` напрямую — иначе сериализация ответа
  подхватит старый закэшированный список версий на объекте `file`
  (см. инвариант в корневом `CLAUDE.md`, конкретный код — `_save_version()`
  в `app/api/files.py`).
