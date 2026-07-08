import { LayoutGrid, List } from 'lucide-react'

export function ViewToggle({ value, onChange }: { value: 'list' | 'grid'; onChange: (value: 'list' | 'grid') => void }) {
  return (
    <div className="view-toggle" role="group" aria-label="Вид">
      <button
        type="button"
        className={value === 'list' ? 'active' : ''}
        aria-pressed={value === 'list'}
        title="Список"
        onClick={() => onChange('list')}
      >
        <List size={16} aria-hidden strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={value === 'grid' ? 'active' : ''}
        aria-pressed={value === 'grid'}
        title="Сетка"
        onClick={() => onChange('grid')}
      >
        <LayoutGrid size={16} aria-hidden strokeWidth={1.75} />
      </button>
    </div>
  )
}
