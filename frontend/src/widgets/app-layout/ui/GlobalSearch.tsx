import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SearchResult } from '@/entities/file'
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
  const folderResults = (results.data ?? []).filter((r) => r.type === 'folder')
  const fileResults = (results.data ?? []).filter((r) => r.type === 'file')

  const showDropdown = isOpen && isSearchable

  function selectResult(result: SearchResult) {
    if (result.type === 'folder') {
      navigate(`/?folder=${result.id}`)
    } else {
      navigate(`/?folder=${result.folder_id}&highlight=${result.id}`)
    }
    setQuery('')
    setIsOpen(false)
  }

  function goToSearchPage() {
    navigate(`/search?q=${encodeURIComponent(debounced)}`)
    setIsOpen(false)
  }

  return (
    <div className="global-search">
      <input
        type="search"
        placeholder="Поиск файлов и папок по названию…"
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
          if (e.key === 'Enter' && isSearchable) {
            goToSearchPage()
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
          {!results.isFetching && folderResults.length > 0 && (
            <li className="search-group-label">Папки</li>
          )}
          {!results.isFetching &&
            folderResults.map((result) => (
              <li key={`folder-${result.id}`} onClick={() => selectResult(result)}>
                <span className="file-name">{result.name}</span>
                <span className="mono folder-name">{result.parent_name ?? 'Корень'}</span>
              </li>
            ))}
          {!results.isFetching && fileResults.length > 0 && (
            <li className="search-group-label">Файлы</li>
          )}
          {!results.isFetching &&
            fileResults.map((result) => (
              <li key={`file-${result.id}`} onClick={() => selectResult(result)}>
                <span className="file-name">{result.name}</span>
                <span className="mono folder-name">{result.folder_name}</span>
              </li>
            ))}
          {!results.isFetching && (
            <li className="search-results-all" onClick={() => goToSearchPage()}>
              Показать все результаты →
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
