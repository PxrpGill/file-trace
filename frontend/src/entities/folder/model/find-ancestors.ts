import type { FolderNode } from './types'

/** Цепочка узлов от корня до targetId (не включая сам targetId). null — если не найден. */
export function findAncestorChain(nodes: FolderNode[], targetId: number): FolderNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return []
    const childChain = findAncestorChain(node.children, targetId)
    if (childChain !== null) return [node, ...childChain]
  }
  return null
}
