import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

const sizeClasses = {
  sm: 'mobishop-dialog--sm',
  md: 'mobishop-dialog--md',
  lg: 'mobishop-dialog--lg',
  xl: 'mobishop-dialog--xl',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const html = document.documentElement
    const prevHtml = html.style.overflow
    const prevBody = document.body.style.overflow
    html.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtml
      document.body.style.overflow = prevBody
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', onCancel)
    return () => dialog.removeEventListener('cancel', onCancel)
  }, [onClose])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current
    if (!dialog) return
    const rect = dialog.getBoundingClientRect()
    const inside =
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom &&
      e.clientX >= rect.left &&
      e.clientX <= rect.right
    if (!inside) onClose()
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      dir="ltr"
      aria-labelledby="modal-title"
      className={cn('mobishop-dialog', sizeClasses[size])}
      onClick={handleBackdropClick}
    >
      <div className="mobishop-dialog__shell" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mobishop-dialog__header">
          <h2 id="modal-title" className="mobishop-dialog__title">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق" className="shrink-0">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="mobishop-dialog__body">{children}</div>
      </div>
    </dialog>,
    document.body,
  )
}
