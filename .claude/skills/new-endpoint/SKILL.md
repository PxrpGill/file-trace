---
name: new-endpoint
description: Use when adding a new state-changing (POST/PATCH/DELETE) endpoint to file-trace's backend (app/api/*.py) — scaffolds the require_folder_access → mutate → audit.record → db.commit template plus the matching audit-log test, per the pattern in app/api/files.py.
---

# Новый мутирующий эндпоинт (backend)

Подробное обоснование каждого пункта — в `.claude/patterns.md` (раздел
«Backend: шаблон эндпоинта, меняющего состояние»). Здесь — короткий
чек-лист действий.

## Шаги

1. **Проверка доступа первой строкой**, до любого изменения состояния:
   - работаешь с файлом — `file = _get_file(db, user, file_id, PermissionLevel.write)`
     (или `.read`, если чтение) — переиспользуй хелпер модуля, не дублируй руками;
   - работаешь с папкой — `require_folder_access(db, user, folder_id, level)`;
   - массовая операция — `_resolve_bulk_files(db, file_ids, levels, level)`,
     возвращает `(ok, failed)` с `reason` (`"not_found"`/`"forbidden"`) —
     отдай `failed` в ответе как `skipped`, не глотай молча.

2. **Само изменение состояния.**

3. **Если это новое действие аудита** — сначала добавь:
   - `AuditAction.<new_action>` в `backend/app/models/audit.py`;
   - перевод в `ACTION_LABELS` — `frontend/src/entities/audit/model/action-labels.ts`
     (иначе в журнале аудита на фронте будет дыра в подписи).

4. **`audit.record(...)`** сразу после изменения — контекста в `details`
   должно хватать, чтобы восстановить «что произошло» из одной записи:
   ```python
   audit.record(
       db, AuditAction.<action>,
       user_id=user.id, file_id=..., folder_id=..., ip=client_ip(request),
       details={...},
   )
   ```

5. **`db.commit()` в конце эндпоинта**, не внутри `record()` — действие и
   аудит-след должны быть одной транзакцией.

6. **Тест** в соответствующем `tests/test_*.py` (один файл на роутер/фичу).
   Переиспользуй хелперы через импорт (`from tests.test_auth import auth_header`,
   `from tests.test_folders import grant, make_folder`), не дублируй.
   Тест обязан проверять **и** ответ, **и** запись в `db.query(AuditLog)`
   (см. `test_upload_creates_file_with_version_and_audit` в `test_files.py`).

7. **Прогнать:**
   ```bash
   cd backend && uv run pytest tests/test_<module>.py -q
   cd backend && uv run ruff check .
   ```

## Шаблон (конденсат из app/api/files.py)

```python
@router.post("/...", response_model=SomeOut, status_code=status.HTTP_201_CREATED)
def do_thing(
    ..., db: DbDep, user: ActiveUser, request: Request
) -> SomeModel:
    obj = require_folder_access(db, user, folder_id, PermissionLevel.write)
    # ...изменение состояния...
    audit.record(
        db, AuditAction.some_action,
        user_id=user.id, file_id=..., folder_id=..., ip=client_ip(request),
        details={...},
    )
    db.commit()
    return obj
```

## Когда аудит не нужен

Read-only эндпоинты (`list_files`, `search_files`) аудит не пишут — журнал
фиксирует действия, а не то, что уже раскрывается просмотром папки. Если
новый эндпоинт — просто чтение, ориентируйся на этот прецедент, а не
добавляй audit.record «на всякий случай».
