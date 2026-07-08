import type { FolderNode } from '../model/types'

export function FolderPicker({
  folders,
  excludeFolderId,
  onSelect,
}: {
  folders: { node: FolderNode; depth: number }[]
  excludeFolderId?: number
  onSelect: (folderId: number) => void
}) {
  return (
    <select
      id="move-target"
      defaultValue=""
      onChange={(e) => {
        const folderId = Number(e.target.value)
        if (!folderId) return
        onSelect(folderId)
      }}
    >
      <option value="" disabled>
        Выберите папку…
      </option>
      {folders
        .filter(({ node }) => node.level === 'write' && node.id !== excludeFolderId)
        .map(({ node, depth }) => (
          <option key={node.id} value={node.id}>
            {' '.repeat(depth * 3)}
            {node.name}
          </option>
        ))}
    </select>
  )
}
