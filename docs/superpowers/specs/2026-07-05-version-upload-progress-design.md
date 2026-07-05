# Индикатор загрузки новой версии файла

Дата: 2026-07-05

## Проблема

`UploadVersionButton` (`frontend/src/features/file/create-version/ui/UploadVersionButton.tsx`)
запускает `useCreateVersionMutation` сразу после выбора файла и не показывает никакого
состояния до ответа сервера — кнопка «Новая версия» выглядит как обычно, строка файла в
таблице не меняется. Пользователь не понимает, что версия грузится, и может кликнуть ещё
раз или уйти со страницы.

## Решение

### 1. Мутация: ключ по fileId + прогресс аплоада

`use-create-version.ts` — хук параметризуется `fileId` (аналогично существующему
`useUploadFileMutation(folderId)`):

```ts
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

`mutationKey: ['create-version', fileId]` не используется для кэширования данных (это
мутация, не query) — он нужен только как публичный идентификатор в глобальном мутационном
кэше react-query, по которому `BrowserPage` сможет спросить «по этому файлу сейчас что-то
грузится?» через `useIsMutating`, не имея прямой ссылки на конкретный вызов `mutate`.

### 2. Кнопка: прогресс-бар вместо кнопки

`UploadVersionButton` получает новый проп `disabled?: boolean` (пробрасывается из строки
таблицы — см. п.3) и локальный `useState<number | null>` для процента:

- `progress === null` → рендерится обычная кнопка «Новая версия» (`disabled` применяется к
  ней).
- `progress !== null` → вместо кнопки рендерится прогресс-бар того же размера
  (`.btn.secondary.small`), заполнение — `--wax`, подпись — `NN%` моноширинным шрифтом.

При выборе файла: `setProgress(0)` → `createVersion.mutate({ file, onProgress: setProgress
}, { onError, onSettled: () => setProgress(null) })`. `onSettled` сбрасывает индикатор и при
успехе, и при ошибке — в обоих случаях кнопка должна вернуться в обычное состояние.

### 3. Блокировка остальных действий в строке

В `BrowserPage.tsx`, при рендере строки файла:

```ts
const versionUploading = useIsMutating({ mutationKey: ['create-version', file.id] }) > 0
```

`versionUploading` передаётся как новый проп `disabled` в:

- `DownloadFileButton` (`frontend/src/features/file/download-file/ui/DownloadFileButton.tsx`)
- `RenameFileAction`, `MoveFileAction`
  (`frontend/src/features/file/rename-move-file/ui/*.tsx`)
- `DeleteFileAction` (`frontend/src/features/file/delete-file/ui/DeleteFileAction.tsx`)
- `UploadVersionButton` (см. п.2 — не даёт запустить вторую загрузку версии поверх первой)

Ни один из этих четырёх компонентов сейчас не принимает `disabled` — проп добавляется и
прокидывается на их триггер-кнопку (`<button disabled={disabled}>`). Остальная логика
компонентов не меняется.

`useIsMutating` — глобальный хук react-query, читает мутационный кэш по всему приложению;
дополнительный state в `BrowserPage` не нужен, счётчик автоматически обнуляется, когда
мутация с этим `mutationKey` завершается (успех или ошибка).

### 4. Стили

Новый класс в `frontend/src/app/styles/styles.css`, рядом с `.btn.small`:

```css
.version-progress {
  display: inline-flex;
  align-items: center;
  position: relative;
  width: 92px;
  height: 23px; /* совпадает с высотой .btn.secondary.small */
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
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

Ширина подобрана по месту (заменяет кнопку «Новая версия» в тесной колонке `.actions`);
процент прокидывается инлайновой custom-property `style={{ '--pct': progress + '%' }}`.

## Тестирование

Фича полностью на фронте (React state + существующий API), новых backend-эндпоинтов нет —
бэкендовых тестов не требуется. Проверка вручную в браузере: залить версию большого файла
(throttling в devtools), убедиться что кнопка превращается в прогресс-бар с процентами,
кнопки download/rename/move/delete в той же строке становятся `disabled` на время загрузки
и снова активны после завершения (включая случай ошибки — например, обрыв сети).

## Сознательно не делаем (YAGNI)

- Индикатор на уровне строки/таблицы (подсветка, бейдж) — по решению пользователя, состояние
  видно только на самой кнопке.
- Отмену загрузки (кнопка "отменить" на прогресс-баре) — не запрошено.
- Общий переиспользуемый `<ProgressButton>`-компонент — единственный потребитель на сейчас,
  преждевременная абстракция.
