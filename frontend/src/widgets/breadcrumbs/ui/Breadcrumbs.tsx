import { ChevronRight, Folder } from 'lucide-react'
import type { FolderNode } from '@/entities/folder'

export function Breadcrumbs({ chain, onNavigate }: { chain: FolderNode[]; onNavigate: (node: FolderNode) => void }) {
  return (
    <nav className="breadcrumbs" aria-label="Путь">
      <span className="crumb root">
        <Folder size={14} aria-hidden strokeWidth={1.75} />
        Корень
      </span>
      {chain.map((node, index) => {
        const isCurrent = index === chain.length - 1
        return (
          <span key={node.id} style={{ display: 'contents' }}>
            <span className="sep" aria-hidden>
              <ChevronRight size={13} strokeWidth={2} />
            </span>
            {isCurrent ? (
              <span className="crumb current">{node.name}</span>
            ) : (
              <button type="button" className="crumb" onClick={() => onNavigate(node)}>
                {node.name}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}
