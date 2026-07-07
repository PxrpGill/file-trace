import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

export function Modal({ title, onClose, children, className }: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function TextPromptModal({ title, label, initial = '', submitLabel = 'Сохранить', onSubmit, onClose }: {
  title: string
  label: string
  initial?: string
  submitLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSubmit(value.trim())
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <label htmlFor="prompt-value">{label}</label>
        <input
          id="prompt-value"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn">
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function ConfirmModal({ title, text, confirmLabel = 'Удалить', onConfirm, onClose }: {
  title: string
  text: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ margin: 0 }}>{text}</p>
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose}>
          Отмена
        </button>
        <button type="button" className="btn danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
