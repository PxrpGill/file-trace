# Индикатор загрузки новой версии файла — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать пользователю прогресс загрузки новой версии файла прямо на кнопке «Новая версия» и заблокировать остальные действия над файлом (скачать/переименовать/переместить/удалить) на время этой загрузки.

**Architecture:** `useCreateVersionMutation` параметризуется `fileId` и получает `mutationKey: ['create-version', fileId]` + `axios onUploadProgress`. `UploadVersionButton` хранит процент в локальном `useState` и рисует прогресс-бар вместо кнопки. `BrowserPage` читает глобальный кэш мутаций react-query через `useMutationState` (один вызов хука на уровне компонента, без вызовов хуков внутри `.map()`) и на основе него блокирует (`disabled`) остальные кнопки действий в той же строке.

**Tech Stack:** React 19 + TypeScript, `@tanstack/react-query` v5 (`useMutation`, `useMutationState`), `axios` (`onUploadProgress`). Никакого нового фреймворка тестирования — во фронтенде его нет вообще; проверка через `cd frontend && npx tsc -b` (тот же чек, что и `make build`) плюс ручная проверка в браузере.

## Global Constraints

- Весь пользовательский текст — по-русски (см. CLAUDE.md).
- Дизайн-токены только из `frontend/src/app/styles.css` `:root` (`--ink`, `--line`, `--surface`, `--wax`, `--wax-soft`, `--radius`, `--font-mono`) — новых токенов не вводить.
- `verbatimModuleSyntax: true` в tsconfig — все type-only импорты через `import type`.
- Не вызывать хуки react-query внутри `.map()`/циклов — только на верхнем уровне компонента (Rules of Hooks).
- `disabled` пропы — везде опциональные (`disabled?: boolean`), чтобы не ломать существующие вызовы этих компонентов без этого пропа (например, `DownloadFileButton` в `FileDrawer.tsx`, `RenameFileAction`/`MoveFileAction`/`DeleteFileAction` больше нигде, кроме `BrowserPage.tsx`, не используются — проверено).

---

### Task 1: Мутация с прогрессом + кнопка-прогресс-бар

**Files:**
- Modify: `frontend/src/features/file/create-version/model/use-create-version.ts`
- Modify: `frontend/src/features/file/create-version/ui/UploadVersionButton.tsx`

**Interfaces:**
- Produces: `useCreateVersionMutation(fileId: number)` — хук с `mutationKey: ['create-version', fileId]`, `mutate({ file: globalThis.File, onProgress?: (percent: number) => void })`.
- Produces: `UploadVersionButton({ file, disabled, onError })` — проп `disabled?: boolean` добавлен (потребляется в Task 3).
- Produces: CSS-классы `.version-progress`, `.version-progress-fill`, `.version-progress-label` (стили добавляются в Task 3, здесь только разметка их использует).

- [ ] **Step 1: Переписать `use-create-version.ts`**

Текущее содержимое (`frontend/src/features/file/create-version/model/use-create-version.ts`):

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useCreateVersionMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ fileId, file }: { fileId: number; file: globalThis.File }) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/files/${fileId}/versions`, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
```

Заменить целиком на:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/api'

export function useCreateVersionMutation(fileId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['create-version', fileId],
    mutationFn: async ({
      file,
      onProgress,
    }: {
      file: globalThis.File
      onProgress?: (percent: number) => void
    }) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/files/${fileId}/versions`, form, {
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
```

- [ ] **Step 2: Переписать `UploadVersionButton.tsx`**

Текущее содержимое (`frontend/src/features/file/create-version/ui/UploadVersionButton.tsx`):

```tsx
import { useRef } from 'react'
import type { FileItem } from '@/entities/file'
import { useCreateVersionMutation } from '../model/use-create-version'

export function UploadVersionButton({
  file,
  onError,
}: {
  file: FileItem
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const createVersion = useCreateVersionMutation()

  return (
    <>
      <button className="btn secondary small" onClick={() => inputRef.current?.click()}>
        Новая версия
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            createVersion.mutate(
              { fileId: file.id, file: f },
              { onError: () => onError?.('Не удалось загрузить новую версию') },
            )
          }
          e.target.value = ''
        }}
      />
    </>
  )
}
```

Заменить целиком на:

```tsx
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { FileItem } from '@/entities/file'
import { useCreateVersionMutation } from '../model/use-create-version'

export function UploadVersionButton({
  file,
  disabled,
  onError,
}: {
  file: FileItem
  disabled?: boolean
  onError?: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const createVersion = useCreateVersionMutation(file.id)
  const [progress, setProgress] = useState<number | null>(null)

  if (progress !== null) {
    return (
      <span
        className="version-progress"
        style={{ '--pct': `${progress}%` } as CSSProperties}
      >
        <span className="version-progress-fill" />
        <span className="version-progress-label">{progress}%</span>
      </span>
    )
  }

  return (
    <>
      <button
        className="btn secondary small"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Новая версия
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setProgress(0)
            createVersion.mutate(
              { file: f, onProgress: setProgress },
              {
                onError: () => onError?.('Не удалось загрузить новую версию'),
                onSettled: () => setProgress(null),
              },
            )
          }
          e.target.value = ''
        }}
      />
    </>
  )
}
```

- [ ] **Step 3: Проверить сборку типов**

Run: `cd frontend && npx tsc -b`
Expected: без ошибок (CSS-классы ещё не объявлены в styles.css, но TS их не проверяет — это просто строки).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/file/create-version/model/use-create-version.ts frontend/src/features/file/create-version/ui/UploadVersionButton.tsx
git commit -m "feat: показывать прогресс загрузки новой версии файла на кнопке"
```

---

### Task 2: `disabled` проп для соседних действий над файлом

**Files:**
- Modify: `frontend/src/features/file/download-file/ui/DownloadFileButton.tsx`
- Modify: `frontend/src/features/file/rename-move-file/ui/RenameFileAction.tsx`
- Modify: `frontend/src/features/file/rename-move-file/ui/MoveFileAction.tsx`
- Modify: `frontend/src/features/file/delete-file/ui/DeleteFileAction.tsx`

**Interfaces:**
- Produces: `DownloadFileButton({ url, label?, disabled? })`, `RenameFileAction({ file, disabled? })`, `MoveFileAction({ file, disabled?, onError? })`, `DeleteFileAction({ file, disabled?, onDeleted? })` — каждый передаёт `disabled` на свою корневую кнопку-триггер. Потребляется в Task 3.

- [ ] **Step 1: `DownloadFileButton.tsx`**

Текущее содержимое:

```tsx
import { triggerDownload } from '@/shared/api'

export function DownloadFileButton({ url, label = 'Скачать' }: { url: string; label?: string }) {
  return (
    <button className="btn secondary small" onClick={() => triggerDownload(url)}>
      {label}
    </button>
  )
}
```

Заменить целиком на:

```tsx
import { triggerDownload } from '@/shared/api'

export function DownloadFileButton({
  url,
  label = 'Скачать',
  disabled,
}: {
  url: string
  label?: string
  disabled?: boolean
}) {
  return (
    <button className="btn secondary small" disabled={disabled} onClick={() => triggerDownload(url)}>
      {label}
    </button>
  )
}
```

- [ ] **Step 2: `RenameFileAction.tsx`**

Найти строку:

```tsx
export function RenameFileAction({ file }: { file: FileItem }) {
```

Заменить на:

```tsx
export function RenameFileAction({ file, disabled }: { file: FileItem; disabled?: boolean }) {
```

Найти строку:

```tsx
      <button className="btn secondary small" onClick={() => setOpen(true)}>
        Переименовать
      </button>
```

Заменить на:

```tsx
      <button className="btn secondary small" disabled={disabled} onClick={() => setOpen(true)}>
        Переименовать
      </button>
```

- [ ] **Step 3: `MoveFileAction.tsx`**

Найти блок:

```tsx
export function MoveFileAction({
  file,
  onError,
}: {
  file: FileItem
  onError?: (message: string) => void
}) {
```

Заменить на:

```tsx
export function MoveFileAction({
  file,
  disabled,
  onError,
}: {
  file: FileItem
  disabled?: boolean
  onError?: (message: string) => void
}) {
```

Найти строку:

```tsx
      <button className="btn secondary small" onClick={() => setOpen(true)}>
        Переместить
      </button>
```

Заменить на:

```tsx
      <button className="btn secondary small" disabled={disabled} onClick={() => setOpen(true)}>
        Переместить
      </button>
```

- [ ] **Step 4: `DeleteFileAction.tsx`**

Найти строку:

```tsx
export function DeleteFileAction({ file, onDeleted }: { file: FileItem; onDeleted?: () => void }) {
```

Заменить на:

```tsx
export function DeleteFileAction({
  file,
  disabled,
  onDeleted,
}: {
  file: FileItem
  disabled?: boolean
  onDeleted?: () => void
}) {
```

Найти строку:

```tsx
      <button className="btn danger small" onClick={() => setOpen(true)}>
        Удалить
      </button>
```

Заменить на:

```tsx
      <button className="btn danger small" disabled={disabled} onClick={() => setOpen(true)}>
        Удалить
      </button>
```

- [ ] **Step 5: Проверить сборку типов**

Run: `cd frontend && npx tsc -b`
Expected: без ошибок (все новые пропы опциональные, существующие вызовы без `disabled` продолжают собираться).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/file/download-file/ui/DownloadFileButton.tsx frontend/src/features/file/rename-move-file/ui/RenameFileAction.tsx frontend/src/features/file/rename-move-file/ui/MoveFileAction.tsx frontend/src/features/file/delete-file/ui/DeleteFileAction.tsx
git commit -m "feat: добавить проп disabled в действия над файлом"
```

---

### Task 3: Блокировка строки в `BrowserPage` + стили прогресс-бара

**Files:**
- Modify: `frontend/src/pages/browser/ui/BrowserPage.tsx`
- Modify: `frontend/src/app/styles/styles.css`

**Interfaces:**
- Consumes: `useCreateVersionMutation`'s `mutationKey: ['create-version', fileId]` (Task 1), `disabled?: boolean` props on `DownloadFileButton`/`RenameFileAction`/`MoveFileAction`/`DeleteFileAction`/`UploadVersionButton` (Tasks 1–2).
- Produces: рабочий UI — строка файла блокирует остальные действия, пока для этого `file.id` есть pending-мутация `create-version`.

- [ ] **Step 1: Добавить импорт `useMutationState`**

В `frontend/src/pages/browser/ui/BrowserPage.tsx` найти строку:

```tsx
import { useEffect, useState } from 'react'
```

Оставить без изменений (react остаётся тем же), но добавить новый импорт сразу после блока импортов `@tanstack` — в этом файле такого импорта пока нет, добавить новую строку после:

```tsx
import { useFilesQuery } from '@/entities/file'
```

то есть вставить:

```tsx
import { useFilesQuery } from '@/entities/file'
import { useMutationState } from '@tanstack/react-query'
```

- [ ] **Step 2: Вычислить набор файлов с загружаемой версией**

Найти в компоненте `BrowserPage`:

```tsx
  const tree = useFolderTreeQuery()
  const files = useFilesQuery(selected?.id ?? null)
  const uploadFile = useUploadFileMutation(selected?.id ?? null)
```

Заменить на:

```tsx
  const tree = useFolderTreeQuery()
  const files = useFilesQuery(selected?.id ?? null)
  const uploadFile = useUploadFileMutation(selected?.id ?? null)
  const uploadingVersionIds = new Set(
    useMutationState({
      filters: { mutationKey: ['create-version'], status: 'pending' },
      select: (mutation) => mutation.options.mutationKey?.[1] as number,
    }),
  )
```

`useMutationState` вызывается один раз на уровне компонента (не внутри `.map()`) — это единственный хук, читающий глобальный кэш мутаций react-query; `mutationKey: ['create-version']` матчит по префиксу любую мутацию `['create-version', fileId]` в статусе `pending`, `select` достаёт из неё `fileId`.

- [ ] **Step 3: Прокинуть `disabled` в строку таблицы**

Найти блок (внутри `.map((file) => (...))`):

```tsx
                    {(files.data ?? []).map((file) => (
                      <tr key={file.id}>
```

Заменить на:

```tsx
                    {(files.data ?? []).map((file) => {
                      const versionUploading = uploadingVersionIds.has(file.id)
                      return (
                      <tr key={file.id}>
```

Найти блок:

```tsx
                        <td className="actions">
                          <DownloadFileButton url={`/api/files/${file.id}/download`} />{' '}
                          {canWrite && (
                            <>
                              <UploadVersionButton file={file} onError={setErrorMessage} />{' '}
                              <RenameFileAction file={file} />{' '}
                              <MoveFileAction file={file} onError={setErrorMessage} />{' '}
                              <DeleteFileAction file={file} onDeleted={() => setOpenFile(null)} />
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
```

Заменить на:

```tsx
                        <td className="actions">
                          <DownloadFileButton
                            url={`/api/files/${file.id}/download`}
                            disabled={versionUploading}
                          />{' '}
                          {canWrite && (
                            <>
                              <UploadVersionButton
                                file={file}
                                disabled={versionUploading}
                                onError={setErrorMessage}
                              />{' '}
                              <RenameFileAction file={file} disabled={versionUploading} />{' '}
                              <MoveFileAction
                                file={file}
                                disabled={versionUploading}
                                onError={setErrorMessage}
                              />{' '}
                              <DeleteFileAction
                                file={file}
                                disabled={versionUploading}
                                onDeleted={() => setOpenFile(null)}
                              />
                            </>
                          )}
                        </td>
                      </tr>
                      )
                    })}
```

- [ ] **Step 4: Добавить стили прогресс-бара**

В `frontend/src/app/styles/styles.css` найти строку:

```css
.btn.small { padding: 3px 9px; font-size: 13px; }
.btn:disabled { opacity: 0.5; cursor: default; }
```

Заменить на:

```css
.btn.small { padding: 3px 9px; font-size: 13px; }
.btn:disabled { opacity: 0.5; cursor: default; }

.version-progress {
  display: inline-flex;
  align-items: center;
  position: relative;
  width: 92px;
  height: 23px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
  vertical-align: middle;
}
.version-progress-fill {
  position: absolute;
  inset: 0;
  width: var(--pct);
  background: var(--wax-soft);
  transition: width 0.15s ease;
}
.version-progress-label {
  position: relative;
  margin: 0 auto;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
}
```

- [ ] **Step 5: Проверить сборку типов**

Run: `cd frontend && npx tsc -b`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/browser/ui/BrowserPage.tsx frontend/src/app/styles/styles.css
git commit -m "feat: блокировать действия над файлом на время загрузки новой версии"
```

---

### Task 4: Ручная проверка в браузере

**Files:** нет изменений кода — только проверка.

- [ ] **Step 1: Запустить dev-стенд**

Run: `make dev` (нужен `make db` в отдельном терминале, если ещё не поднят).

- [ ] **Step 2: Замедлить сеть**

В Chrome DevTools → Network → throttling → «Slow 3G», чтобы прогресс был виден не мгновенно.

- [ ] **Step 3: Проверить happy path**

Зайти под пользователем с правом записи в папку с файлом → нажать «Новая версия» → выбрать файл заметного размера (несколько МБ).
Expected: кнопка «Новая версия» превращается в прогресс-бар с процентами, растущими от 0 до 100; кнопки «Скачать», «Переименовать», «Переместить», «Удалить» в этой же строке становятся неактивными (`disabled`, приглушены); после завершения загрузки прогресс-бар пропадает, кнопка «Новая версия» и остальные действия снова активны, таблица обновляет размер/версию/дату.

- [ ] **Step 4: Проверить путь с ошибкой**

Во время загрузки версии отключить сеть в DevTools (Offline) или остановить backend.
Expected: после провала запроса прогресс-бар исчезает, кнопка «Новая версия» возвращается, появляется модалка «Не получилось» с текстом «Не удалось загрузить новую версию», остальные кнопки в строке снова активны.

- [ ] **Step 5: Проверить независимость строк**

Если в папке несколько файлов — запустить загрузку версии для одного файла и почти сразу для другого.
Expected: прогресс-бар и блокировка кнопок появляются только в тех строках, где реально идёт загрузка; остальные строки не затронуты.

- [ ] **Step 6: Финальная сборка**

Run: `cd frontend && npx tsc -b && npx vite build`
Expected: сборка проходит без ошибок (эквивалент `make build`).
