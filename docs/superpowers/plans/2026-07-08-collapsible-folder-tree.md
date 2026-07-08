# Сворачиваемое дерево папок Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дерево папок в `FolderTree` умеет сворачиваться/разворачиваться по клику, по умолчанию показывая только корневые папки, и автоматически раскрывает путь до папки, выбранной по URL (`?folder=id`).

**Architecture:** Вся логика — локальный `useState<Set<number>>` внутри `FolderTree` (id развёрнутых папок) + один `useEffect`, который при смене `selectedId` дозаписывает в этот set id предков выбранной папки. Клик по строке одновременно вызывает существующий `onSelect` и переключает (toggle) развёрнутость своих детей. Изменения только на фронтенде, backend и API не трогаем.

**Tech Stack:** React 19 + TypeScript, без новых зависимостей.

## Global Constraints

- Язык UI и комментариев в коде (если пишутся) — русский, но здесь код без комментариев, это не требуется отдельно.
- На фронтенде нет автотестов (`vitest`/`jest` не подключены) — проверка каждого шага через `make build` (`tsc -b && vite build` из корня репозитория) и ручную проверку в браузере через `make dev`, а не через юнит-тесты.
- `FolderTree` используется только в `frontend/src/pages/browser/ui/BrowserPage.tsx` — публичный интерфейс (`nodes`, `selectedId`, `onSelect`) менять нельзя, чтобы не задеть остальные страницы (они используют только `flattenTree`, не сам компонент).
- Существующие CSS-классы `.tree-row`, `.tree-children`, `.lvl` не переименовывать и не менять их текущее поведение.

---

### Task 1: Toggle-разворачивание + стрелка + отступ для листьев

**Files:**
- Modify: `frontend/src/widgets/folder-tree/ui/FolderTree.tsx`
- Modify: `frontend/src/app/styles/styles.css`

**Interfaces:**
- Consumes: `FolderNode` из `@/entities/folder` (поля `id`, `name`, `level`, `children: FolderNode[]`) — без изменений.
- Produces: публичный API `FolderTree({ nodes, selectedId, onSelect })` не меняется — используется в `BrowserPage.tsx:81-88` как раньше. Task 2 будет модифицировать этот же файл дальше (добавит `useEffect` и хелпер `findAncestorIds`), поэтому важно оставить `expanded`/`setExpanded`/`toggle` именно с этими именами.

- [ ] **Step 1: Переписать `FolderTree.tsx` с состоянием развёрнутости**

Полностью замени содержимое `frontend/src/widgets/folder-tree/ui/FolderTree.tsx` на:

```tsx
import { useState } from 'react'
import type { FolderNode } from '@/entities/folder'

interface Props {
  nodes: FolderNode[]
  selectedId: number | null
  onSelect: (node: FolderNode) => void
}

interface TreeNodeProps {
  node: FolderNode
  selectedId: number | null
  onSelect: (node: FolderNode) => void
  expanded: Set<number>
  onToggle: (id: number) => void
}

function TreeNode({ node, selectedId, onSelect, expanded, onToggle }: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = hasChildren && expanded.has(node.id)

  return (
    <div>
      <button
        type="button"
        className={`tree-row ${node.id === selectedId ? 'selected' : ''}`}
        aria-expanded={hasChildren ? isExpanded : undefined}
        onClick={() => {
          onSelect(node)
          if (hasChildren) onToggle(node.id)
        }}
      >
        <span
          aria-hidden
          className={`arrow ${isExpanded ? 'expanded' : ''}`}
          style={hasChildren ? undefined : { visibility: 'hidden' }}
        >
          ▸
        </span>
        <span>{node.name}</span>
        <span className="lvl">{node.level === 'write' ? 'изм.' : 'чт.'}</span>
      </button>
      {isExpanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree({ nodes, selectedId, onSelect }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (nodes.length === 0) {
    return <p className="muted" style={{ padding: '0 8px' }}>Нет доступных папок</p>
  }
  return (
    <div>
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded={expanded}
          onToggle={toggle}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Добавить стили стрелки**

В `frontend/src/app/styles/styles.css` найди блок `.tree-row .lvl { ... }` (около строки 257) и сразу после связанного с ним правила `.tree-row.selected .lvl { color: #c8d2e0; }` добавь:

```css
.tree-row .arrow {
  display: inline-block;
  transition: transform 0.15s ease;
}
.tree-row .arrow.expanded { transform: rotate(90deg); }
```

- [ ] **Step 3: Проверить сборку**

Run: `make build`
Expected: сборка проходит без ошибок TypeScript (никаких сообщений про несуществующие пропсы/типы).

- [ ] **Step 4: Ручная проверка в браузере**

Run: `make dev` (если ещё не запущен — оба сервера: API и Vite), открой `http://localhost:5173`, залогинься.
Проверь:
- при открытии страницы «Обзор» видны только корневые папки, вложенные списки свёрнуты;
- клик по папке с вложенными папками одновременно выбирает её (подсветка `.selected`, справа появляются файлы) и раскрывает список вложенных папок, стрелка поворачивается на 90°;
- повторный клик по той же папке сворачивает её вложенный список обратно (стрелка возвращается), выбор папки остаётся;
- клик по папке без вложенных папок просто выбирает её, стрелки нет, но имя не сдвигается относительно папок со стрелкой (проверить визуально — отступ слева одинаковый).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/widgets/folder-tree/ui/FolderTree.tsx frontend/src/app/styles/styles.css
git commit -m "feat: сворачиваемое дерево папок по клику"
```

---

### Task 2: Автораскрытие пути до папки, выбранной по URL

**Files:**
- Modify: `frontend/src/widgets/folder-tree/ui/FolderTree.tsx`

**Interfaces:**
- Consumes: состояние `expanded`/`setExpanded` из Task 1 (тот же файл), пропс `selectedId: number | null`, `nodes: FolderNode[]`.
- Produces: ничего нового наружу — поведение видно только через раскрытие дерева при внешнем выборе папки.

- [ ] **Step 1: Добавить хелпер поиска предков и эффект**

В `frontend/src/widgets/folder-tree/ui/FolderTree.tsx`:

1. Замени импорт `import { useState } from 'react'` на:

```tsx
import { useEffect, useState } from 'react'
```

2. Перед функцией `TreeNode` добавь:

```tsx
function findAncestorIds(nodes: FolderNode[], targetId: number): number[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return []
    const childPath = findAncestorIds(node.children, targetId)
    if (childPath !== null) return [node.id, ...childPath]
  }
  return null
}
```

3. Внутри `FolderTree`, сразу после строки `const [expanded, setExpanded] = useState<Set<number>>(new Set())`, добавь:

```tsx
  useEffect(() => {
    if (selectedId === null) return
    const ancestorIds = findAncestorIds(nodes, selectedId)
    if (!ancestorIds || ancestorIds.length === 0) return
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const id of ancestorIds) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedId, nodes])
```

Обрати внимание: `findAncestorIds` возвращает id родителей выбранного узла, но не сам узел — раскрываются только предки, собственные дети выбранной папки остаются свёрнутыми до явного клика по ней.

- [ ] **Step 2: Проверить сборку**

Run: `make build`
Expected: сборка проходит без ошибок.

- [ ] **Step 3: Ручная проверка автораскрытия по URL**

Run: `make dev`, открой в браузере страницу с адресом вида
`http://localhost:5173/browser?folder=<id>`, где `<id>` — id папки,
вложенной минимум на 2 уровня (создай при необходимости через UI:
корневая папка → вложенная → вложенная во вложенную).

Проверь:
- при загрузке страницы по этой ссылке в дереве видна и подсвечена
  (`.selected`) целевая папка на нужном уровне вложенности;
- все папки-предки на пути к ней раскрыты (их стрелки повёрнуты);
- папки вне этого пути остаются свёрнутыми, как и по умолчанию;
- обычная навигация кликами (без `?folder=`) по-прежнему работает как
  в Task 1 (клик разворачивает/сворачивает и выбирает).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/widgets/folder-tree/ui/FolderTree.tsx
git commit -m "feat: автораскрытие пути до папки, выбранной по ссылке"
```

---

## Self-Review Notes

- Спек покрыт полностью: начальное состояние «всё свёрнуто» (Task 1
  Step 1), клик по строке разворачивает и выбирает (Task 1 Step 1),
  стрелка/спейсер для листьев (Task 1 Step 1-2), автораскрытие пути по
  URL (Task 2).
- Именование состояния (`expanded`, `setExpanded`, `toggle`,
  `findAncestorIds`) единообразно между Task 1 и Task 2 — Task 2
  явно переиспользует объявления из Task 1 в том же файле.
- Вне объёма (кнопки «развернуть/свернуть всё», persist в
  localStorage, клавиатурная навигация) — как и зафиксировано в
  спеке, в план не включено.
