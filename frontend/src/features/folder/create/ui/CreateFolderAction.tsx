import { useState } from 'react'
import { TextPromptModal } from '@/shared/ui'
import { useCreateFolderMutation } from '../model/use-create-folder'

export function CreateFolderAction({
  parentId,
  buttonLabel,
  buttonClassName = 'btn secondary',
  dialogTitle,
  onError,
}: {
  parentId: number | null
  buttonLabel: string
  buttonClassName?: string
  dialogTitle: string
  onError?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const createFolder = useCreateFolderMutation()

  return (
    <>
      <button className={buttonClassName} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
      {open && (
        <TextPromptModal
          title={dialogTitle}
          label="Название папки"
          submitLabel="Создать"
          onClose={() => setOpen(false)}
          onSubmit={(name) => {
            setOpen(false)
            createFolder.mutate(
              { name, parent_id: parentId },
              { onError: () => onError?.('Не удалось создать папку') },
            )
          }}
        />
      )}
    </>
  )
}
