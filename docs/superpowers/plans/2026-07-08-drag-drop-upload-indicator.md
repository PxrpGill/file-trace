# Индикаторы drag-and-drop и загрузки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать оверлей, пока файл тянут над рабочей областью BrowserPage, и неблокирующую плашку со спиннером, пока файлы загружаются на сервер.

**Architecture:** Всё локально во frontend: счётчик `dragenter`/`dragleave` + оверлей-ячейка грида `.browser` для перетаскивания; `mutationKey: ['upload-file']` + `useMutationState` (существующий паттерн `create-version`/`extract`) для плашки загрузки. Backend не меняется.

**Tech Stack:** React 19, TypeScript, @tanstack/react-query v5, чистый CSS (`frontend/src/app/styles/styles.css`).

Спека: `docs/superpowers/specs/2026-07-08-drag-drop-upload-indicator-design.md`.

## Global Constraints

- Все UI-тексты — по-русски: «Отпустите, чтобы загрузить в „{имя}“», «Загрузка недоступна — только чтение», «Сначала выберите папку», «Загружается файлов: N…».
- Новых npm-зависимостей нет; спиннер — CSS-анимация.
- Стили — только на существующих токенах `:root` из `styles.css` (`--ink`, `--wax`, `--wax-soft`, `--line`, `--surface`, `--radius`, `--paper`).
- Во frontend нет тестового фреймворка (только `oxlint`+`steiger` и `tsc`) — не добавлять его; проверка каждой задачи: `npm run build` и `npm run lint` из `frontend/`, финальная задача — ручная проверка в браузере.
- Отклонение от спеки (одобрено при планировании): оверлей — не абсолютный элемент внутри `.content` (он прокручивается, и оверлей уезжал бы вместе с контентом), а сосед `<main>` в гриде `.browser` с `grid-area: 1 / 2` и `pointer-events: none`.

---

### Task 1: Плашка «Загружается файлов: N…»

**Files:**
- Modify: `frontend/src/features/file/upload-file/model/use-upload-file.ts`
- Modify: `frontend/src/pages/browser/ui/BrowserPage.tsx`
- Modify: `frontend/src/app/styles/styles.css`

**Interfaces:**
- Consumes: `useMutationState` из `@tanstack/react-query` (уже импортирован в BrowserPage), классы-токены `styles.css`.
- Produces: mutationKey `['upload-file']` у мутации загрузки; CSS-классы `.upload-banner` и `.spinner`. Последующие задачи их не потребляют — задачи 1 и 2 независимы.

- [ ] **Step 1: Добавить mutationKey мутации загрузки**

В `frontend/src/features/file/upload-file/model/use-upload-file.ts` добавить `mutationKey` первой строкой опций `useMutation`:

```ts
export function useUploadFileMutation(folderId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['upload-file'],
    mutationFn: async (file: globalThis.File) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/folders/${folderId}/files`, form)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tree'] })
      queryClient.invalidateQueries({ queryKey: ['files'] })
    },
  })
}
```

- [ ] **Step 2: Считать активные загрузки в BrowserPage**

В `frontend/src/pages/browser/ui/BrowserPage.tsx` после блока `extractingIds` (строки ~42–47) добавить:

```tsx
  const uploadingCount = useMutationState({
    filters: { mutationKey: ['upload-file'], status: 'pending' },
  }).length
```

- [ ] **Step 3: Вывести плашку под шапкой**

Там же, сразу после закрывающего `</div>` элемента `content-head` (перед блоком `{(files.data ?? []).length === 0 ? ...}`) вставить:

```tsx
            {uploadingCount > 0 && (
              <div className="upload-banner">
                <span className="spinner" aria-hidden="true" />
                <span>Загружается файлов: {uploadingCount}…</span>
              </div>
            )}
```

- [ ] **Step 4: Стили плашки и спиннера**

В `frontend/src/app/styles/styles.css` после правила `.content-head .spacer { flex: 1; }` (строка ~275) добавить:

```css
.upload-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12px;
}
.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--line);
  border-top-color: var(--wax);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

- [ ] **Step 5: Проверить сборку и линт**

Run: `cd frontend && npm run build && npm run lint`
Expected: `tsc -b` без ошибок, vite build успешен, oxlint/steiger без новых ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/file/upload-file/model/use-upload-file.ts frontend/src/pages/browser/ui/BrowserPage.tsx frontend/src/app/styles/styles.css
git commit -m "feat: плашка «Загружается файлов: N…» во время загрузки файлов"
```

---

### Task 2: Оверлей при перетаскивании файла

**Files:**
- Modify: `frontend/src/pages/browser/ui/BrowserPage.tsx`
- Modify: `frontend/src/app/styles/styles.css`

**Interfaces:**
- Consumes: состояние `selected`/`canWrite` и мутация `uploadFile`, уже существующие в BrowserPage; грид `.browser { grid-template-columns: 260px 1fr }` из `styles.css`.
- Produces: CSS-классы `.drop-overlay` и `.drop-overlay.denied`; ничего для последующих задач.

- [ ] **Step 1: Состояние перетаскивания**

В `frontend/src/pages/browser/ui/BrowserPage.tsx`:

Импорт (первая строка файла):

```tsx
import { useEffect, useRef, useState } from 'react'
```

После `const [errorMessage, setErrorMessage] = useState('')` добавить:

```tsx
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
```

- [ ] **Step 2: Обработчики drag-событий на `<main>`**

Заменить текущие атрибуты `onDragOver`/`onDrop` элемента `<main className="content" ...>` (строки ~95–106) на:

```tsx
      <main
        className="content"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          dragCounter.current += 1
          setIsDragOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          dragCounter.current = Math.max(0, dragCounter.current - 1)
          if (dragCounter.current === 0) setIsDragOver(false)
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = canWrite ? 'copy' : 'none'
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragCounter.current = 0
          setIsDragOver(false)
          if (!canWrite) return
          for (const f of Array.from(e.dataTransfer.files)) {
            uploadFile.mutate(f, { onError: () => setErrorMessage('Не удалось загрузить файл') })
          }
        }}
      >
```

Пояснения (не копировать в код):
- счётчик нужен, потому что `dragenter`/`dragleave` всплывают с дочерних элементов; при переходе на ребёнка порядок событий даёт 1→2→1, при уходе с области — 0;
- проверка `types.includes('Files')` отсекает перетаскивание текста/ссылок;
- `dropEffect = 'none'` при read-only: браузер показывает курсор «нельзя», событие `drop` не срабатывает, вместо него приходит `dragleave` (счётчик обнуляется), и браузер не открывает файл вместо SPA;
- `e.preventDefault()` в `onDrop` защищает от навигации браузера на файл.

- [ ] **Step 3: Разметка оверлея**

Там же, сразу после закрывающего тега `</main>` (перед `{openFile && <FileDrawer ...>}`) добавить:

```tsx
      {isDragOver && (
        <div className={`drop-overlay${canWrite ? '' : ' denied'}`}>
          {selected === null
            ? 'Сначала выберите папку'
            : canWrite
              ? `Отпустите, чтобы загрузить в «${selected.name}»`
              : 'Загрузка недоступна — только чтение'}
        </div>
      )}
```

Оверлей — прямой ребёнок `<div className="browser">`, занимает ту же ячейку грида, что и `<main>`.

- [ ] **Step 4: Стили оверлея**

В `frontend/src/app/styles/styles.css` после блока `.upload-banner`/`.spinner`/`@keyframes spin` из Task 1 добавить:

```css
.drop-overlay {
  grid-area: 1 / 2;
  z-index: 5;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px;
  padding: 24px;
  text-align: center;
  border: 2px dashed var(--ink);
  border-radius: var(--radius);
  background: rgba(250, 251, 253, 0.9);
  color: var(--ink);
  font-size: 16px;
  font-weight: 500;
}
.drop-overlay.denied {
  border-color: var(--wax);
  color: var(--wax);
  background: rgba(246, 228, 224, 0.9);
}
```

(`rgba(250, 251, 253, …)` — это `--paper`, `rgba(246, 228, 224, …)` — `--wax-soft` с прозрачностью; rgba-вариантов у токенов нет, поэтому значения продублированы числами.)

- [ ] **Step 5: Проверить сборку и линт**

Run: `cd frontend && npm run build && npm run lint`
Expected: `tsc -b` без ошибок, vite build успешен, oxlint/steiger без новых ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/browser/ui/BrowserPage.tsx frontend/src/app/styles/styles.css
git commit -m "feat: оверлей рабочей области при перетаскивании файла"
```

---

### Task 3: Ручная проверка в браузере

**Files:** нет изменений кода (правки — только если проверка выявит дефекты).

**Interfaces:**
- Consumes: dev-стек `make db` + `make dev` (API :8000, UI :5173), админ из `make admin`.

- [ ] **Step 1: Поднять окружение**

Run: `make db`, затем `make dev` (фоново). Открыть `http://localhost:5173`, войти.

- [ ] **Step 2: Чек-лист поведения**

1. Выбрать папку с правом write, перетащить файл из ОС на рабочую область: появляется пунктирный оверлей «Отпустите, чтобы загрузить в «{папка}»»; увести курсор за пределы области — оверлей исчезает.
2. Бросить 2–3 файла: оверлей исчезает, под шапкой появляется плашка со спиннером «Загружается файлов: N…», по завершении она исчезает и файлы появляются в таблице.
3. Нажать «Загрузить файл» и выбрать файл: плашка появляется и без drag-and-drop.
4. Папка read-only (или отдельный пользователь без write): при перетаскивании — красный (сургучный) оверлей «Загрузка недоступна — только чтение», курсор «нельзя», после отпускания ничего не загружено и страница не ушла на файл.
5. Без выбранной папки: оверлей «Сначала выберите папку».
6. Перетащить выделенный текст (не файл): оверлей не появляется.
7. В папке с длинным списком файлов прокрутить вниз и перетащить файл: оверлей накрывает видимую область целиком.

- [ ] **Step 3: Зафиксировать результат**

Если найдены дефекты — исправить, повторить `npm run build && npm run lint` и чек-лист, закоммитить исправления с префиксом `fix:`.
