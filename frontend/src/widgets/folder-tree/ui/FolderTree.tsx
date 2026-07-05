import type { FolderNode } from '@/entities/folder'

interface Props {
  nodes: FolderNode[]
  selectedId: number | null
  onSelect: (node: FolderNode) => void
}

function TreeNode({ node, selectedId, onSelect }: { node: FolderNode } & Omit<Props, 'nodes'>) {
  return (
    <div>
      <button
        type="button"
        className={`tree-row ${node.id === selectedId ? 'selected' : ''}`}
        onClick={() => onSelect(node)}
      >
        <span aria-hidden>▸</span>
        <span>{node.name}</span>
        <span className="lvl">{node.level === 'write' ? 'изм.' : 'чт.'}</span>
      </button>
      {node.children.length > 0 && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree({ nodes, selectedId, onSelect }: Props) {
  if (nodes.length === 0) {
    return <p className="muted" style={{ padding: '0 8px' }}>Нет доступных папок</p>
  }
  return (
    <div>
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  )
}
