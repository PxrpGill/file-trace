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
