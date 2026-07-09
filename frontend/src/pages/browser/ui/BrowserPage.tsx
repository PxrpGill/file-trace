import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/entities/session'
import type { FolderNode } from '@/entities/folder'
import { useFolderTreeQuery, flattenTree, findAncestorChain } from '@/entities/folder'
import type { FileItem } from '@/entities/file'
import { useFilesQuery, isArchiveFile, getPreviewKind, summarizeBulkResult, FileIcon } from '@/entities/file'
import { useMutationState } from '@tanstack/react-query'
import { formatDate, formatSize } from '@/shared/lib'
import { Modal, ProgressBar } from '@/shared/ui'
import { FileTable, SelectionToolbar } from '@/widgets/file-table'
import type { FileTableColumn } from '@/widgets/file-table'
import { FileGrid } from '@/widgets/file-grid'
import { ViewToggle } from '@/widgets/view-toggle'
import { FolderTree } from '@/widgets/folder-tree'
import { FileDrawer } from '@/widgets/file-drawer'
import { Breadcrumbs } from '@/widgets/breadcrumbs'
import { FileContextMenu, FolderContextMenu } from '@/widgets/context-menu'
import { CreateFolderAction } from '@/features/folder/create'
import { RenameFolderAction } from '@/features/folder/rename'
import { DeleteFolderAction } from '@/features/folder/delete'
import { UploadFileButton, useUploadFileMutation } from '@/features/file/upload-file'
import { UploadVersionButton } from '@/features/file/create-version'
import { RenameFileAction, MoveFileAction } from '@/features/file/rename-move-file'
import { DeleteFileAction } from '@/features/file/delete-file'
import { DownloadFileButton } from '@/features/file/download-file'
import { ExtractArchiveAction } from '@/features/file/extract-archive'
import { PreviewModal } from '@/features/file/preview-file'
import { BulkMoveAction, useBulkMoveMutation } from '@/features/file/bulk-move'
import { BulkDeleteAction } from '@/features/file/bulk-delete'
import { BulkDownloadAction } from '@/features/file/bulk-download'

type ContextMenuState =
  | { kind: 'file'; file: FileItem; x: number; y: number }
  | { kind: 'folder'; folder: FolderNode; x: number; y: number }
  | null

export function BrowserPage() {
  const { user } = useSession()
  const [selected, setSelected] = useState<FolderNode | null>(null)
  const [openFile, setOpenFile] = useState<FileItem | null>(null)
  const [highlightedFileId, setHighlightedFileId] = useState<number | null>(null)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [resultMessage, setResultMessage] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('file-trace:view-mode') === 'grid' ? 'grid' : 'list'),
  )
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const [uploads, setUploads] = useState<{ id: number; name: string; progress: number }[]>([])
  const uploadIdRef = useRef(0)

  const tree = useFolderTreeQuery()
  const files = useFilesQuery(selected?.id ?? null)
  const fileRows = useMemo(() => files.data?.pages.flatMap((page) => page.items) ?? [], [files.data])
  const uploadFile = useUploadFileMutation(selected?.id ?? null)
  const bulkMove = useBulkMoveMutation()

  const startUpload = async (file: globalThis.File) => {
    const id = ++uploadIdRef.current
    setUploads((u) => [...u, { id, name: file.name, progress: 0 }])
    try {
      await uploadFile.mutateAsync({
        file,
        onProgress: (progress) =>
          setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress } : x))),
      })
    } catch {
      setErrorMessage('Не удалось загрузить файл')
    } finally {
      setUploads((u) => u.filter((x) => x.id !== id))
    }
  }
  const uploadingVersionIdsList = useMutationState({
    filters: { mutationKey: ['create-version'], status: 'pending' },
    select: (mutation) => mutation.options.mutationKey?.[1] as number,
  })
  const extractingIdsList = useMutationState({
    filters: { mutationKey: ['extract'], status: 'pending' },
    select: (mutation) => mutation.options.mutationKey?.[1] as number,
  })
  // useMutationState возвращает стабильную ссылку, пока реально ничего не
  // изменилось — оборачиваем в useMemo, иначе `new Set(...)` пересоздавался
  // бы на каждый рендер и обесценивал memo у строк FileTable.
  const uploadingVersionIds = useMemo(() => new Set(uploadingVersionIdsList), [uploadingVersionIdsList])
  const extractingIds = useMemo(() => new Set(extractingIdsList), [extractingIdsList])

  useEffect(() => {
    setSelectedIds(new Set())
    setResultMessage('')
    setHighlightedFileId(null)
  }, [selected?.id])

  useEffect(() => {
    localStorage.setItem('file-trace:view-mode', viewMode)
  }, [viewMode])

  useEffect(() => {
    const folderParam = searchParams.get('folder')
    if (!folderParam || !tree.data) return
    const folderId = Number(folderParam)
    if (selected?.id === folderId) return
    const match = flattenTree(tree.data).find((n) => n.node.id === folderId)
    if (match) setSelected(match.node)
  }, [searchParams, tree.data])

  useEffect(() => {
    const highlightParam = searchParams.get('highlight')
    if (!highlightParam || fileRows.length === 0) return
    const fileId = Number(highlightParam)
    const match = fileRows.find((f) => f.id === fileId)
    if (match) {
      setHighlightedFileId(match.id)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, fileRows])

  const canWrite = selected?.level === 'write'
  const isAdmin = user?.role === 'admin'

  const breadcrumbChain = useMemo(() => {
    if (!selected) return []
    const ancestors = findAncestorChain(tree.data ?? [], selected.id) ?? []
    return [...ancestors, selected]
  }, [tree.data, selected])

  const onToggleFile = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const onToggleAllFiles = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(fileRows.map((f) => f.id)) : new Set())
    },
    [fileRows],
  )

  const fileColumns = useMemo<FileTableColumn<FileItem>[]>(
    () => [
      {
        header: 'Размер',
        className: 'mono',
        render: (file) => (file.current_version ? formatSize(file.current_version.size) : '—'),
      },
      {
        header: 'Версия',
        className: 'mono',
        render: (file) => `v${file.current_version?.version_no ?? 0}`,
      },
      {
        header: 'Обновлён',
        className: 'mono',
        render: (file) =>
          file.current_version ? formatDate(file.current_version.created_at) : '—',
      },
    ],
    [],
  )

  const renderName = useCallback(
    (file: FileItem) => (
      <span
        className="file-name"
        role="button"
        tabIndex={0}
        onClick={() => setOpenFile(file)}
        onKeyDown={(e) => e.key === 'Enter' && setOpenFile(file)}
      >
        <FileIcon name={file.name} />
        {file.name}
      </span>
    ),
    [],
  )

  const renderActions = useCallback(
    (file: FileItem) => {
      const versionUploading = uploadingVersionIds.has(file.id)
      const extracting = extractingIds.has(file.id)
      const rowBusy = versionUploading || extracting
      return (
        <>
          {getPreviewKind(file.name) !== null && (
            <>
              <button
                className="btn secondary small"
                disabled={rowBusy}
                onClick={() => setPreviewFile(file)}
              >
                Просмотр
              </button>{' '}
            </>
          )}
          <DownloadFileButton url={`/api/files/${file.id}/download`} disabled={rowBusy} />{' '}
          {canWrite && (
            <>
              <UploadVersionButton file={file} disabled={rowBusy} onError={setErrorMessage} />{' '}
              {isArchiveFile(file.name) && (
                <>
                  <ExtractArchiveAction file={file} disabled={rowBusy} onError={setErrorMessage} />{' '}
                </>
              )}
              <RenameFileAction file={file} disabled={rowBusy} />{' '}
              <MoveFileAction file={file} disabled={rowBusy} onError={setErrorMessage} />{' '}
              <DeleteFileAction
                file={file}
                disabled={rowBusy}
                onDeleted={() => setOpenFile(null)}
              />
            </>
          )}
        </>
      )
    },
    [uploadingVersionIds, extractingIds, canWrite],
  )

  return (
    <div className="browser">
      <aside className="sidebar">
        <h2>Папки</h2>
        <FolderTree
          nodes={tree.data ?? []}
          selectedId={selected?.id ?? null}
          onSelect={(node) => {
            setSelected(node)
            setOpenFile(null)
          }}
          onNodeContextMenu={(node, x, y) => setContextMenu({ kind: 'folder', folder: node, x, y })}
          onFilesDrop={(fileIds, folderId) => {
            bulkMove.mutate(
              { fileIds, folderId },
              {
                onSuccess: (result) => {
                  setResultMessage(
                    summarizeBulkResult('Перемещено', result.moved.length, fileIds.length, result.skipped),
                  )
                  setSelectedIds(new Set())
                },
                onError: () => setErrorMessage('Не удалось переместить файлы'),
              },
            )
          }}
        />
        {isAdmin && (
          <CreateFolderAction
            parentId={null}
            buttonLabel="+ Корневая папка"
            buttonClassName="btn secondary small"
            dialogTitle="Новая корневая папка"
            onError={setErrorMessage}
          />
        )}
      </aside>

      <main
        className="content"
        onClickCapture={() => {
          if (highlightedFileId !== null) setHighlightedFileId(null)
        }}
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          dragCounter.current += 1
          setIsDragOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          dragCounter.current = Math.max(0, dragCounter.current - 1)
          if (dragCounter.current === 0) setIsDragOver(false)
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = canWrite ? 'copy' : 'none'
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragCounter.current = 0
          setIsDragOver(false)
          if (!canWrite) return
          for (const f of Array.from(e.dataTransfer.files)) {
            startUpload(f)
          }
        }}
      >
        {selected === null ? (
          <div className="empty">Выберите папку слева, чтобы увидеть файлы</div>
        ) : (
          <>
            <div className="content-sticky">
              <Breadcrumbs
                chain={breadcrumbChain}
                onNavigate={(node) => {
                  setSelected(node)
                  setOpenFile(null)
                }}
              />
              <div className="content-head">
                <h1>{selected.name}</h1>
                <span className="muted">
                  {canWrite ? 'чтение и изменение' : 'только чтение'}
                </span>
                <span className="spacer" />
                <ViewToggle value={viewMode} onChange={setViewMode} />
                {canWrite && (
                  <>
                    <UploadFileButton onFilesSelected={(files) => files.forEach(startUpload)} />
                    {/* <UploadTreeButton folderId={selected.id} onError={setErrorMessage} /> */}
                    <CreateFolderAction
                      parentId={selected.id}
                      buttonLabel="+ Папка"
                      dialogTitle={`Новая папка в «${selected.name}»`}
                      onError={setErrorMessage}
                    />
                    <RenameFolderAction
                      folder={selected}
                      onRenamed={(name) => setSelected({ ...selected, name })}
                      onError={setErrorMessage}
                    />
                    <DeleteFolderAction
                      folder={selected}
                      onDeleted={() => setSelected(null)}
                      onError={setErrorMessage}
                    />
                  </>
                )}
              </div>

              {uploads.length > 0 && (
                <div className="upload-banner" role="status">
                  {uploads.map((u) => (
                    <div key={u.id} className="upload-row">
                      <span className="upload-name">{u.name}</span>
                      <ProgressBar percent={u.progress} />
                    </div>
                  ))}
                </div>
              )}

              <SelectionToolbar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
                <BulkDownloadAction
                  fileIds={[...selectedIds]}
                  onResult={(result) => {
                    setResultMessage(
                      summarizeBulkResult('Скачано', result.files.length, selectedIds.size, result.skipped),
                    )
                  }}
                  onError={setErrorMessage}
                />{' '}
                {canWrite && (
                  <>
                    <BulkMoveAction
                      fileIds={[...selectedIds]}
                      onDone={(result) => {
                        setResultMessage(
                          summarizeBulkResult('Перемещено', result.moved.length, selectedIds.size, result.skipped),
                        )
                        setSelectedIds(new Set())
                      }}
                      onError={setErrorMessage}
                    />{' '}
                    <BulkDeleteAction
                      fileIds={[...selectedIds]}
                      onDone={(result) => {
                        setResultMessage(
                          summarizeBulkResult('Удалено', result.deleted.length, selectedIds.size, result.skipped),
                        )
                        setSelectedIds(new Set())
                      }}
                    />
                  </>
                )}
              </SelectionToolbar>
            </div>

            {resultMessage && (
              <div className="bulk-result-banner">
                {resultMessage}{' '}
                <button className="btn secondary small" onClick={() => setResultMessage('')}>
                  ×
                </button>
              </div>
            )}

            {viewMode === 'list' ? (
              <FileTable
                rows={fileRows}
                emptyMessage={
                  'В папке пока нет файлов' +
                  (canWrite ? ' — перетащите файл сюда или нажмите «Загрузить файл»' : '')
                }
                selectedIds={selectedIds}
                onToggle={onToggleFile}
                onToggleAll={onToggleAllFiles}
                columns={fileColumns}
                renderName={renderName}
                renderActions={renderActions}
                highlightId={highlightedFileId}
                onContextMenu={(file, x, y) => setContextMenu({ kind: 'file', file, x, y })}
                draggable={canWrite}
                onEndReached={
                  files.hasNextPage && !files.isFetchingNextPage
                    ? () => files.fetchNextPage()
                    : undefined
                }
              />
            ) : (
              <FileGrid
                rows={fileRows}
                emptyMessage={
                  'В папке пока нет файлов' +
                  (canWrite ? ' — перетащите файл сюда или нажмите «Загрузить файл»' : '')
                }
                selectedIds={selectedIds}
                onToggle={onToggleFile}
                onOpenRow={(file) => setOpenFile(file)}
                renderIcon={(file) => <FileIcon name={file.name} size={32} />}
                renderName={(file) => file.name}
                renderMeta={(file) =>
                  file.current_version ? formatSize(file.current_version.size) : '—'
                }
                getTitle={(file) => file.name}
                highlightId={highlightedFileId}
                onContextMenu={(file, x, y) => setContextMenu({ kind: 'file', file, x, y })}
                draggable={canWrite}
                onEndReached={
                  files.hasNextPage && !files.isFetchingNextPage
                    ? () => files.fetchNextPage()
                    : undefined
                }
              />
            )}
          </>
        )}
      </main>

      {isDragOver && (
        <div className={`drop-overlay${canWrite ? '' : ' denied'}`}>
          {selected === null
            ? 'Сначала выберите папку'
            : canWrite
              ? `Отпустите, чтобы загрузить в «${selected.name}»`
              : 'Загрузка недоступна — только чтение'}
        </div>
      )}

      {openFile && (
        <FileDrawer
          file={openFile}
          onClose={() => setOpenFile(null)}
          onOpenPreview={() => setPreviewFile(openFile)}
        />
      )}

      {previewFile && <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}

      {contextMenu?.kind === 'file' && (
        <FileContextMenu
          file={contextMenu.file}
          canWrite={canWrite}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onOpenPreview={() => setPreviewFile(contextMenu.file)}
          onError={setErrorMessage}
        />
      )}

      {contextMenu?.kind === 'folder' && (
        <FolderContextMenu
          folder={contextMenu.folder}
          canWrite={contextMenu.folder.level === 'write'}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onRenamed={(name) => {
            if (selected?.id === contextMenu.folder.id) setSelected({ ...selected, name })
          }}
          onDeleted={() => {
            if (selected?.id === contextMenu.folder.id) setSelected(null)
          }}
          onError={setErrorMessage}
        />
      )}

      {errorMessage && (
        <Modal title="Не получилось" onClose={() => setErrorMessage('')} className="danger">
          <p style={{ margin: 0 }}>{errorMessage}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setErrorMessage('')}>
              Понятно
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
