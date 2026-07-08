---
name: new-feature
description: Use when adding a new user action to file-trace's frontend (frontend/src/features/<domain>/<action>/) — scaffolds the FSD feature folder (index.ts barrel, model/use-*.ts mutation hook, ui/*.tsx component) per existing features like rename-move-file and upload-file.
---

# Новая feature-папка (frontend, FSD)

Подробное обоснование — в `.claude/patterns.md` (раздел «Frontend: анатомия
одной фичи»). Здесь — короткий чек-лист и шаблон.

## Структура

```
features/<domain>/<action>/
  index.ts              # публичный re-export
  model/use-<action>.ts # useMutation-хук
  ui/<Action>.tsx        # компонент
```

## Шаги

1. **`model/use-<action>.ts`** — тонкая обёртка над `useMutation`
   (`@tanstack/react-query`):
   - `mutationFn` вызывает `api.<method>(url, body)` из `@/shared/api`;
   - `onSuccess` инвалидирует релевантные query keys (`['tree']`, `['files']`
     и т.п.) — **не** делай ручной рефетч/сеттинг кэша руками. Бэкенд уже
     атомарно пишет аудит и коммитит транзакцию, так что фронту достаточно
     инвалидировать кэш — дополнительный аудит-запрос не нужен.

2. **`ui/<Action>.tsx`** — компонент, использующий хук. Если это простой
   элемент (кнопка, инпут) — держи его без сайд-эффектов: он принимает
   callback пропом и сам не мутирует и не дёргает API напрямую (см.
   `UploadFileButton.tsx`); вызов мутации остаётся в
   родительском виджете/странице или в `ui/`-компоненте фичи, если он один
   на всю фичу (см. `RenameFileAction.tsx`).

3. **`index.ts`** — re-export только того, что нужно снаружи:
   ```ts
   export { use<Action>Mutation } from './model/use-<action>'
   ```

4. **Импорты между слоями — только через паблик `index.ts` чужого слоя**
   (`@/shared/api`, `@/entities/file`, ...), не вглубь чужого модуля.
   Это же проверяет `steiger` в `npm run lint` — если границы нарушены,
   упадёт линт, а не только ревью.

5. **Подключить в виджет/страницу**, которая должна показывать это действие
   (`FileTable`, `FileDrawer`, `BrowserPage`, ...) через barrel-импорт.

6. **Прогнать:**
   ```bash
   cd frontend && npm run build   # tsc -b + vite build
   cd frontend && npm run lint    # oxlint + steiger (границы FSD)
   ```

## Шаблон хука (конденсат из use-update-file.ts)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function use<Action>Mutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { /* ... */ }) => api.<method>(`/api/...`, args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
```
