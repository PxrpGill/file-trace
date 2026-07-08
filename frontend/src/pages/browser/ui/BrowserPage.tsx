import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/entities/session'
import type { FolderNode } from '@/entities/folder'
import { useFolderTreeQuery, flattenTree } from '@/entities/folder'
import type { FileItem } from '@/entities/file'
import { useFilesQuery, isArchiveFile, getPreviewKind } from '@/entities/file'
import { useMutationState } from '@tanstack/react-query'
import { formatDate, formatSize } from '@/shared/lib'
import { Modal } from '@/shared/ui'
import { FolderTree } from '@/widgets/folder-tree'
import { FileDrawer } from '@/widgets/file-drawer'
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

export function BrowserPage() {
  const { user } = useSession()
  const [selected, setSelected] = useState<FolderNode | null>(null)
  const [openFile, setOpenFile] = useState<FileItem | null>(null)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const [searchParams, setSearchParams] = useSearchParams()

  const tree = useFolderTreeQuery()
  const files = useFilesQuery(selected?.id ?? null)
  const uploadFile = useUploadFileMutation(selected?.id ?? null)
  const uploadingVersionIds = new Set(
    useMutationState({
      filters: { mutationKey: ['create-version'], status: 'pending' },
      select: (mutation) => mutation.options.mutationKey?.[1] as number,
    }),
  )
  const extractingIds = new Set(
    useMutationState({
      filters: { mutationKey: ['extract'], status: 'pending' },
      select: (mutation) => mutation.options.mutationKey?.[1] as number,
    }),
  )

  const uploadingCount = useMutationState({
    filters: { mutationKey: ['upload-file'], status: 'pending' },
  }).length

  useEffect(() => {
    const folderParam = searchParams.get('folder')
    if (!folderParam || !tree.data) return
    const folderId = Number(folderParam)
    if (selected?.id === folderId) return
    const match = flattenTree(tree.data).find((n) => n.node.id === folderId)
    if (match) setSelected(match.node)
  }, [searchParams, tree.data])

  useEffect(() => {
    const fileParam = searchParams.get('file')
    if (!fileParam || !files.data) return
    const fileId = Number(fileParam)
    const match = files.data.find((f) => f.id === fileId)
    if (match) {
      setOpenFile(match)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, files.data])

  const canWrite = selected?.level === 'write'
  const isAdmin = user?.role === 'admin'

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
            uploadFile.mutate(f, { onError: () => setErrorMessage('Не удалось загрузить файл') })
          }
        }}
      >
        {selected === null ? (
          <div className="empty">Выберите папку слева, чтобы увидеть файлы</div>
        ) : (
          <>
            <div className="content-head">
              <h1>{selected.name}</h1>
              <span className="muted">
                {canWrite ? 'чтение и изменение' : 'только чтение'}
              </span>
              <span className="spacer" />
              {canWrite && (
                <>
                  <UploadFileButton folderId={selected.id} onError={setErrorMessage} />
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

            {uploadingCount > 0 && (
              <div className="upload-banner" role="status">
                <span className="spinner" aria-hidden="true" />
                <span>Загружается файлов: {uploadingCount}…</span>
              </div>
            )}

            {(files.data ?? []).length === 0 ? (
              <div className="empty">
                В папке пока нет файлов
                {canWrite && ' — перетащите файл сюда или нажмите «Загрузить файл»'}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Имя</th>
                      <th>Размер</th>
                      <th>Версия</th>
                      <th>Обновлён</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(files.data ?? []).map((file) => {
                      const versionUploading = uploadingVersionIds.has(file.id)
                      const extracting = extractingIds.has(file.id)
                      const rowBusy = versionUploading || extracting
                      return (
                      <tr key={file.id}>
                        <td>
                          <span
                            className="file-name"
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenFile(file)}
                            onKeyDown={(e) => e.key === 'Enter' && setOpenFile(file)}
                          >
                            {file.name}
                          </span>
                        </td>
                        <td className="mono">
                          {file.current_version ? formatSize(file.current_version.size) : '—'}
                        </td>
                        <td className="mono">v{file.current_version?.version_no ?? 0}</td>
                        <td className="mono">
                          {file.current_version ? formatDate(file.current_version.created_at) : '—'}
                        </td>
                        <td className="actions">
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
                          <DownloadFileButton
                            url={`/api/files/${file.id}/download`}
                            disabled={rowBusy}
                          />{' '}
                          {canWrite && (
                            <>
                              <UploadVersionButton
                                file={file}
                                disabled={rowBusy}
                                onError={setErrorMessage}
                              />{' '}
                              {isArchiveFile(file.name) && (
                                <>
                                  <ExtractArchiveAction
                                    file={file}
                                    disabled={rowBusy}
                                    onError={setErrorMessage}
                                  />{' '}
                                </>
                              )}
                              <RenameFileAction file={file} disabled={rowBusy} />{' '}
                              <MoveFileAction
                                file={file}
                                disabled={rowBusy}
                                onError={setErrorMessage}
                              />{' '}
                              <DeleteFileAction
                                file={file}
                                disabled={rowBusy}
                                onDeleted={() => setOpenFile(null)}
                              />
                            </>
                          )}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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

      {openFile && <FileDrawer file={openFile} onClose={() => setOpenFile(null)} />}

      {previewFile && <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}

      {errorMessage && (
        <Modal title="Не получилось" onClose={() => setErrorMessage('')}>
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
