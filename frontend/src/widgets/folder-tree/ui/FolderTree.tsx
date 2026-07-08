import { useEffect, useState } from 'react'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import type { FolderNode } from '@/entities/folder'
import { findAncestorChain } from '@/entities/folder'
import { FILE_IDS_DRAG_TYPE } from '@/entities/file'

interface Props {
  nodes: FolderNode[]
  selectedId: number | null
  onSelect: (node: FolderNode) => void
  onNodeContextMenu?: (node: FolderNode, x: number, y: number) => void
  onFilesDrop?: (fileIds: number[], folderId: number) => void
}

interface TreeNodeProps {
  node: FolderNode
  selectedId: number | null
  onSelect: (node: FolderNode) => void
  expanded: Set<number>
  onToggle: (id: number) => void
  onNodeContextMenu?: (node: FolderNode, x: number, y: number) => void
  onFilesDrop?: (fileIds: number[], folderId: number) => void
  dragOverId: number | null
  setDragOverId: (id: number | null) => void
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  expanded,
  onToggle,
  onNodeContextMenu,
  onFilesDrop,
  dragOverId,
  setDragOverId,
}: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const isExpanded = hasChildren && expanded.has(node.id)
  const isDragOver = dragOverId === node.id
  const dragClass = isDragOver ? (node.level === 'write' ? ' drag-over' : ' drag-denied') : ''

  return (
    <div>
      <button
        type="button"
        className={`tree-row ${node.id === selectedId ? 'selected' : ''}${dragClass}`}
        aria-expanded={hasChildren ? isExpanded : undefined}
        onClick={() => {
          onSelect(node)
          if (hasChildren) onToggle(node.id)
        }}
        onContextMenu={
          onNodeContextMenu
            ? (e) => {
                e.preventDefault()
                onNodeContextMenu(node, e.clientX, e.clientY)
              }
            : undefined
        }
        onDragOver={(e) => {
          if (!onFilesDrop || !e.dataTransfer.types.includes(FILE_IDS_DRAG_TYPE)) return
          if (node.level === 'write') e.preventDefault()
          setDragOverId(node.id)
        }}
        onDragLeave={(e) => {
          if (!onFilesDrop || !e.dataTransfer.types.includes(FILE_IDS_DRAG_TYPE)) return
          setDragOverId(dragOverId === node.id ? null : dragOverId)
        }}
        onDrop={(e) => {
          if (!onFilesDrop || !e.dataTransfer.types.includes(FILE_IDS_DRAG_TYPE)) return
          e.preventDefault()
          setDragOverId(null)
          if (node.level !== 'write') return
          try {
            const ids = JSON.parse(e.dataTransfer.getData(FILE_IDS_DRAG_TYPE)) as number[]
            onFilesDrop(ids, node.id)
          } catch {
            // повреждённый payload перетаскивания — игнорируем
          }
        }}
      >
        <span
          aria-hidden
          className={`arrow ${isExpanded ? 'expanded' : ''}`}
          style={hasChildren ? undefined : { visibility: 'hidden' }}
        >
          <ChevronRight size={14} strokeWidth={2} />
        </span>
        {isExpanded ? <FolderOpen size={15} aria-hidden strokeWidth={1.75} /> : <Folder size={15} aria-hidden strokeWidth={1.75} />}
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
              onNodeContextMenu={onNodeContextMenu}
              onFilesDrop={onFilesDrop}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree({ nodes, selectedId, onSelect, onNodeContextMenu, onFilesDrop }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  useEffect(() => {
    if (selectedId === null) return
    const ancestors = findAncestorChain(nodes, selectedId)
    if (!ancestors || ancestors.length === 0) return
    setExpanded((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const { id } of ancestors) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedId, nodes])

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
          onNodeContextMenu={onNodeContextMenu}
          onFilesDrop={onFilesDrop}
          dragOverId={dragOverId}
          setDragOverId={setDragOverId}
        />
      ))}
    </div>
  )
}
