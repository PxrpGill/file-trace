import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FileSearchResult } from '@/entities/file'
import { useFileSearchQuery } from '@/entities/file'
import { useDebouncedValue } from '@/shared/lib'

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const navigate = useNavigate()

  const debounced = useDebouncedValue(query, 300)
  const isSearchable = debounced.trim().length >= 2
  const results = useFileSearchQuery(debounced)

  const showDropdown = isOpen && isSearchable

  function selectResult(result: FileSearchResult) {
    navigate(`/?folder=${result.folder_id}&file=${result.id}`)
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div className="global-search">
      <input
        type="search"
        placeholder="Поиск файлов по названию…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setIsOpen(false), 150)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false)
            e.currentTarget.blur()
          }
        }}
      />
      {showDropdown && (
        <ul
          className="search-results"
          onMouseDown={(e) => {
            e.preventDefault()
            clearTimeout(blurTimer.current)
          }}
        >
          {results.isFetching && <li className="empty">Ищем…</li>}
          {!results.isFetching && (results.data ?? []).length === 0 && (
            <li className="empty">Ничего не найдено</li>
          )}
          {!results.isFetching &&
            (results.data ?? []).map((result) => (
              <li key={result.id} onClick={() => selectResult(result)}>
                <span className="file-name">{result.name}</span>
                <span className="mono folder-name">{result.folder_name}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
