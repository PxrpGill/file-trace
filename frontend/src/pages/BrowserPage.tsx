import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { api, triggerDownload } from '../api/client'
import type { FileItem, FolderNode } from '../api/types'
import { formatDate, formatSize } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { FileDrawer } from '../components/FileDrawer'
import { FolderTree, flattenTree } from '../components/FolderTree'
import { ConfirmModal, Modal, TextPromptModal } from '../components/Modal'

type Dialog =
  | { kind: 'new-root' }
  | { kind: 'new-subfolder' }
  | { kind: 'rename-folder' }
  | { kind: 'delete-folder' }
  | { kind: 'rename-file'; file: FileItem }
  | { kind: 'move-file'; file: FileItem }
  | { kind: 'delete-file'; file: FileItem }
  | null

export function BrowserPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<FolderNode | null>(null)
  const [openFile, setOpenFile] = useState<FileItem | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const uploadRef = useRef<HTMLInputElement>(null)
  const versionRef = useRef<HTMLInputElement>(null)
  const versionTarget = useRef<FileItem | null>(null)

  const tree = useQuery({
    queryKey: ['tree'],
    queryFn: async () => (await api.get<FolderNode[]>('/api/folders/tree')).data,
  })

  const files = useQuery({
    queryKey: ['files', selected?.id],
    enabled: selected !== null,
    queryFn: async () =>
      (await api.get<FileItem[]>(`/api/folders/${selected!.id}/files`)).data,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tree'] })
    queryClient.invalidateQueries({ queryKey: ['files'] })
  }

  const fail = (fallback: string) => (error: unknown) => {
    const detail = (error as { response?: { data?: { detail?: string } } })
      .response?.data?.detail
    setErrorMessage(detail ?? fallback)
  }

  const createFolder = useMutation({
    mutationFn: (body: { name: string; parent_id: number | null }) =>
      api.post('/api/folders', body),
    onSuccess: invalidate,
    onError: fail('Не удалось создать папку'),
  })

  const uploadFile = useMutation({
    mutationFn: async (file: globalThis.File) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/folders/${selected!.id}/files`, form)
    },
    onSuccess: invalidate,
    onError: fail('Не удалось загрузить файл'),
  })

  const uploadVersion = useMutation({
    mutationFn: async ({ fileId, file }: { fileId: number; file: globalThis.File }) => {
      const form = new FormData()
      form.append('upload', file)
      await api.post(`/api/files/${fileId}/versions`, form)
    },
    onSuccess: invalidate,
    onError: fail('Не удалось загрузить новую версию'),
  })

  const canWrite = selected?.level === 'write'
  const isAdmin = user?.role === 'admin'
  const allFolders = flattenTree(tree.data ?? [])

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
          <button
            className="btn secondary small"
            style={{ margin: '12px 8px 0' }}
            onClick={() => setDialog({ kind: 'new-root' })}
          >
            + Корневая папка
          </button>
        )}
      </aside>

      <main
        className="content"
        onDragOver={(e) => {
          if (canWrite) e.preventDefault()
        }}
        onDrop={(e) => {
          if (!canWrite) return
          e.preventDefault()
          for (const f of Array.from(e.dataTransfer.files)) uploadFile.mutate(f)
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
                  <button className="btn" onClick={() => uploadRef.current?.click()}>
                    Загрузить файл
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => setDialog({ kind: 'new-subfolder' })}
                  >
                    + Папка
                  </button>
                  <button
                    className="btn secondary"
                    onClick={() => setDialog({ kind: 'rename-folder' })}
                  >
                    Переименовать
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => setDialog({ kind: 'delete-folder' })}
                  >
                    Удалить папку
                  </button>
                </>
              )}
            </div>

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
                    {(files.data ?? []).map((file) => (
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
                          <button
                            className="btn secondary small"
                            onClick={() =>
                              triggerDownload(`/api/files/${file.id}/download`)
                            }
                          >
                            Скачать
                          </button>{' '}
                          {canWrite && (
                            <>
                              <button
                                className="btn secondary small"
                                onClick={() => {
                                  versionTarget.current = file
                                  versionRef.current?.click()
                                }}
                              >
                                Новая версия
                              </button>{' '}
                              <button
                                className="btn secondary small"
                                onClick={() => setDialog({ kind: 'rename-file', file })}
                              >
                                Переименовать
                              </button>{' '}
                              <button
                                className="btn secondary small"
                                onClick={() => setDialog({ kind: 'move-file', file })}
                              >
                                Переместить
                              </button>{' '}
                              <button
                                className="btn danger small"
                                onClick={() => setDialog({ kind: 'delete-file', file })}
                              >
                                Удалить
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        <input
          ref={uploadRef}
          type="file"
          hidden
          multiple
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) uploadFile.mutate(f)
            e.target.value = ''
          }}
        />
        <input
          ref={versionRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f && versionTarget.current) {
              uploadVersion.mutate({ fileId: versionTarget.current.id, file: f })
            }
            e.target.value = ''
          }}
        />
      </main>

      {openFile && <FileDrawer file={openFile} onClose={() => setOpenFile(null)} />}

      {dialog?.kind === 'new-root' && (
        <TextPromptModal
          title="Новая корневая папка"
          label="Название папки"
          submitLabel="Создать"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            createFolder.mutate({ name, parent_id: null })
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'new-subfolder' && selected && (
        <TextPromptModal
          title={`Новая папка в «${selected.name}»`}
          label="Название папки"
          submitLabel="Создать"
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            createFolder.mutate({ name, parent_id: selected.id })
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'rename-folder' && selected && (
        <TextPromptModal
          title="Переименовать папку"
          label="Новое название"
          initial={selected.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            setDialog(null)
            try {
              await api.patch(`/api/folders/${selected.id}`, { name })
              setSelected({ ...selected, name })
              invalidate()
            } catch {
              setErrorMessage('Не удалось переименовать папку')
            }
          }}
        />
      )}
      {dialog?.kind === 'delete-folder' && selected && (
        <ConfirmModal
          title="Удалить папку"
          text={`Папка «${selected.name}» будет удалена. Удалить можно только пустую папку.`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setDialog(null)
            try {
              await api.delete(`/api/folders/${selected.id}`)
              setSelected(null)
              invalidate()
            } catch {
              setErrorMessage('Папка не пуста — сначала удалите её содержимое')
            }
          }}
        />
      )}
      {dialog?.kind === 'rename-file' && (
        <TextPromptModal
          title="Переименовать файл"
          label="Новое имя файла"
          initial={dialog.file.name}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            setDialog(null)
            await api.patch(`/api/files/${dialog.file.id}`, { name })
            invalidate()
          }}
        />
      )}
      {dialog?.kind === 'move-file' && (
        <Modal title={`Переместить «${dialog.file.name}»`} onClose={() => setDialog(null)}>
          <label htmlFor="move-target">Папка назначения</label>
          <select
            id="move-target"
            defaultValue=""
            onChange={async (e) => {
              const folderId = Number(e.target.value)
              if (!folderId) return
              setDialog(null)
              try {
                await api.patch(`/api/files/${dialog.file.id}`, { folder_id: folderId })
                invalidate()
              } catch {
                setErrorMessage('Нет права на запись в папку назначения')
              }
            }}
          >
            <option value="" disabled>
              Выберите папку…
            </option>
            {allFolders
              .filter(({ node }) => node.level === 'write' && node.id !== dialog.file.folder_id)
              .map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {' '.repeat(depth * 3)}
                  {node.name}
                </option>
              ))}
          </select>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setDialog(null)}>
              Отмена
            </button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'delete-file' && (
        <ConfirmModal
          title="Удалить файл"
          text={`Файл «${dialog.file.name}» будет перемещён в корзину. Администратор сможет его восстановить.`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setDialog(null)
            await api.delete(`/api/files/${dialog.file.id}`)
            setOpenFile(null)
            invalidate()
          }}
        />
      )}
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
