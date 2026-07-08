import { Archive, File, FileText, Image, Sheet, Video } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isArchiveFile } from './types'

const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv']
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
const VIDEO_EXTENSIONS = ['.mp4', '.webm']
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt', '.md']

function hasExtension(name: string, extensions: string[]): boolean {
  const lower = name.toLowerCase()
  return extensions.some((ext) => lower.endsWith(ext))
}

export function getFileIcon(name: string): LucideIcon {
  if (isArchiveFile(name)) return Archive
  if (hasExtension(name, SPREADSHEET_EXTENSIONS)) return Sheet
  if (hasExtension(name, IMAGE_EXTENSIONS)) return Image
  if (hasExtension(name, VIDEO_EXTENSIONS)) return Video
  if (hasExtension(name, DOCUMENT_EXTENSIONS)) return FileText
  return File
}
