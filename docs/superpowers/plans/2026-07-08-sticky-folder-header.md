# Sticky-шапка страницы папки — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Шапка папки (`.content-head`) и панель массовых действий (`SelectionToolbar`) в `BrowserPage` остаются видимыми и кликабельными при прокрутке длинного списка файлов вниз.

**Architecture:** Чистый фронтенд/CSS. `.content-head` и `<SelectionToolbar>` оборачиваются в новый `<div className="content-sticky">` с `position: sticky; top: 0` внутри существующего скролл-контейнера `.content`. Баннеры (`upload-banner`, `bulk-result-banner`) переносятся в JSX ниже sticky-блока — они не должны прилипать.

**Tech Stack:** React + TypeScript (frontend/src/pages/browser/ui/BrowserPage.tsx), styles.css (frontend/src/app/styles/styles.css). Без новых зависимостей.

## Global Constraints

- Спек: `docs/superpowers/specs/2026-07-08-sticky-folder-header-design.md`.
- Sticky-зона = только `.content-head` + `SelectionToolbar`. Баннеры (`upload-banner`, `bulk-result-banner`) в неё не входят — рендерятся после sticky-блока, перед `FileTable`.
- Без JS/IntersectionObserver для эффектов «прилип/не прилип» — только постоянный `border-bottom`.
- Мобильный breakpoint (`@media (max-width: 720px)`, styles.css:569) не трогать — `.content` там не переопределяет `overflow-y`, sticky работает без изменений.
- Проверка типов и сборка: `make build` (`tsc -b && vite build`) из корня репозитория.

---

### Task 1: Sticky-обёртка шапки и панели массовых действий

**Files:**
- Modify: `frontend/src/pages/browser/ui/BrowserPage.tsx:141-221` (JSX-блок внутри `{selected !== null && (...)}`)
- Modify: `frontend/src/app/styles/styles.css` (добавить класс `.content-sticky` рядом с `.content-head`, после строки 280)

**Interfaces:**
- Consumes: существующие `selected`, `canWrite`, `isAdmin`, `uploadingCount`, `resultMessage`, `selectedIds`, обработчики и компоненты (`CreateFolderAction`, `RenameFolderAction`, `DeleteFolderAction`, `UploadFileButton`, `SelectionToolbar`, `BulkDownloadAction`, `BulkMoveAction`, `BulkDeleteAction`) — все без изменений сигнатур.
- Produces: новый CSS-класс `.content-sticky`, используемый только в этом файле. Никакой новый экспорт/API не появляется — задача самодостаточна, других задач в плане нет.

- [ ] **Step 1: Переставить JSX — обернуть шапку и тулбар, вынести баннеры после них**

В `frontend/src/pages/browser/ui/BrowserPage.tsx` текущий блок (строки 141-221):

```tsx
          <>
            <div className="content-head">
              <h1>{selected.name}</h1>
              <span className="muted">
                {canWrite ? 'чтение и изменение' : 'только чтение'}
              </span>
              <span className="spacer" />
              {canWrite && (
                <>
                  <UploadFileButton folderId={selected.id} onError={setErrorMessage} />
                  {/* <UploadTreeButton folderId={selected.id} onError={setErrorMessage} /> */}
                  <CreateFolderAction
                    parentId={selected.id}
                    buttonLabel="+ Папка"
                    dialogTitle={`Новая папка в «${selected.name}»`}
                    onError={setErrorMessage}
                  />
                  <RenameFolderAction
                    folder={selected}
                    onRenamed={(name) => setSelected({ ...selected, name })}
                    onError={setErrorMessage}
                  />
                  <DeleteFolderAction
                    folder={selected}
                    onDeleted={() => setSelected(null)}
                    onError={setErrorMessage}
                  />
                </>
              )}
            </div>

            {uploadingCount > 0 && (
              <div className="upload-banner" role="status">
                <span className="spinner" aria-hidden="true" />
                <span>Загружается файлов: {uploadingCount}…</span>
              </div>
            )}

            {resultMessage && (
              <div className="bulk-result-banner">
                {resultMessage}{' '}
                <button className="btn secondary small" onClick={() => setResultMessage('')}>
                  ×
                </button>
              </div>
            )}

            <SelectionToolbar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
              <BulkDownloadAction
                fileIds={[...selectedIds]}
                onResult={(result) => {
                  setResultMessage(
                    summarizeBulkResult('Скачано', result.files.length, selectedIds.size, result.skipped),
                  )
                }}
                onError={setErrorMessage}
              />{' '}
              {canWrite && (
                <>
                  <BulkMoveAction
                    fileIds={[...selectedIds]}
                    onDone={(result) => {
                      setResultMessage(
                        summarizeBulkResult('Перемещено', result.moved.length, selectedIds.size, result.skipped),
                      )
                      setSelectedIds(new Set())
                    }}
                    onError={setErrorMessage}
                  />{' '}
                  <BulkDeleteAction
                    fileIds={[...selectedIds]}
                    onDone={(result) => {
                      setResultMessage(
                        summarizeBulkResult('Удалено', result.deleted.length, selectedIds.size, result.skipped),
                      )
                      setSelectedIds(new Set())
                    }}
                  />
                </>
              )}
            </SelectionToolbar>

            <FileTable
```

заменить на (порядок: sticky-блок с шапкой и тулбаром → баннеры → таблица):

```tsx
          <>
            <div className="content-sticky">
              <div className="content-head">
                <h1>{selected.name}</h1>
                <span className="muted">
                  {canWrite ? 'чтение и изменение' : 'только чтение'}
                </span>
                <span className="spacer" />
                {canWrite && (
                  <>
                    <UploadFileButton folderId={selected.id} onError={setErrorMessage} />
                    {/* <UploadTreeButton folderId={selected.id} onError={setErrorMessage} /> */}
                    <CreateFolderAction
                      parentId={selected.id}
                      buttonLabel="+ Папка"
                      dialogTitle={`Новая папка в «${selected.name}»`}
                      onError={setErrorMessage}
                    />
                    <RenameFolderAction
                      folder={selected}
                      onRenamed={(name) => setSelected({ ...selected, name })}
                      onError={setErrorMessage}
                    />
                    <DeleteFolderAction
                      folder={selected}
                      onDeleted={() => setSelected(null)}
                      onError={setErrorMessage}
                    />
                  </>
                )}
              </div>

              <SelectionToolbar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
                <BulkDownloadAction
                  fileIds={[...selectedIds]}
                  onResult={(result) => {
                    setResultMessage(
                      summarizeBulkResult('Скачано', result.files.length, selectedIds.size, result.skipped),
                    )
                  }}
                  onError={setErrorMessage}
                />{' '}
                {canWrite && (
                  <>
                    <BulkMoveAction
                      fileIds={[...selectedIds]}
                      onDone={(result) => {
                        setResultMessage(
                          summarizeBulkResult('Перемещено', result.moved.length, selectedIds.size, result.skipped),
                        )
                        setSelectedIds(new Set())
                      }}
                      onError={setErrorMessage}
                    />{' '}
                    <BulkDeleteAction
                      fileIds={[...selectedIds]}
                      onDone={(result) => {
                        setResultMessage(
                          summarizeBulkResult('Удалено', result.deleted.length, selectedIds.size, result.skipped),
                        )
                        setSelectedIds(new Set())
                      }}
                    />
                  </>
                )}
              </SelectionToolbar>
            </div>

            {uploadingCount > 0 && (
              <div className="upload-banner" role="status">
                <span className="spinner" aria-hidden="true" />
                <span>Загружается файлов: {uploadingCount}…</span>
              </div>
            )}

            {resultMessage && (
              <div className="bulk-result-banner">
                {resultMessage}{' '}
                <button className="btn secondary small" onClick={() => setResultMessage('')}>
                  ×
                </button>
              </div>
            )}

            <FileTable
```

(Остальной JSX — тело `<FileTable ...>` и всё, что после — не меняется.)

- [ ] **Step 2: Добавить стиль `.content-sticky` в styles.css**

В `frontend/src/app/styles/styles.css` сразу после блока (строки 279-280):

```css
.content-head h1 { font-size: 19px; margin: 0; letter-spacing: -0.01em; }
.content-head .spacer { flex: 1; }
```

добавить:

```css
.content-sticky {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
}
```

- [ ] **Step 3: Проверка типов и сборка**

Run: `cd /Users/this_is_gilya/projects/file-trace && make build`
Expected: команда завершается без ошибок (`tsc -b && vite build` проходит, вывод оканчивается сборкой в `frontend/dist`).

- [ ] **Step 4: Ручная проверка в браузере**

Run: `make dev` (поднимет API :8000 и UI :5173; для API нужен `make db` + `make migrate`, если ещё не поднято).

В браузере на `http://localhost:5173`:
1. Войти, открыть папку с достаточным количеством файлов, чтобы список прокручивался (если таких нет — загрузить несколько файлов).
2. Прокрутить список файлов вниз — шапка с названием папки и кнопками должна остаться приклеенной к верху и быть кликабельной; под шапкой должна быть видна тонкая линия-разделитель, строки таблицы не должны просвечивать сквозь текст шапки.
3. Выделить один-два файла (чекбоксы в таблице) — панель «Выбрано файлов: N» должна появиться сразу под шапкой и тоже остаться приклеенной при скролле.
4. Снять выделение — панель массовых действий должна исчезнуть, шапка остаётся на месте.
5. Запустить загрузку файла (кнопка «Загрузить файл» или drag-and-drop) — баннер «Загружается файлов…» должен появиться НИЖЕ sticky-блока (не прилипать, должен уезжать при скролле).
6. Сузить окно браузера до мобильной ширины (≤720px) — поведение должно остаться прежним (шапка приклеена в пределах `.content`).

Expected: все пункты выше подтверждаются визуально. Если что-то не так — вернуться к Step 1-2 и поправить.

- [ ] **Step 5: Commit**

```bash
cd /Users/this_is_gilya/projects/file-trace
git add frontend/src/pages/browser/ui/BrowserPage.tsx frontend/src/app/styles/styles.css
git commit -m "feat: сделать шапку папки и панель массовых действий sticky"
```
