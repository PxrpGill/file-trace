import { getFileIcon } from '../model/file-icon'

export function FileIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = getFileIcon(name)
  return <Icon size={size} aria-hidden strokeWidth={1.75} />
}
