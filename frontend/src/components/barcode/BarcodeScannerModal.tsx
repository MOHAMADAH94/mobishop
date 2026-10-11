import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { X } from 'lucide-react'
import { Button } from '../ui/Button'
import { normalizeLookupCode } from '../../lib/productLookup'

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
]

interface Props {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
  title?: string
  hint?: string
}

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
  title = 'مسح الباركود بالكاميرا',
  hint,
}: Props) {
  const reactId = useId()
  const regionId = `barcode-scanner-${reactId.replace(/:/g, '')}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScanRef = useRef<{ code: string; at: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    const scanner = new Html5Qrcode(regionId, {
      verbose: false,
      formatsToSupport: SUPPORTED_FORMATS,
    })
    scannerRef.current = scanner
    setError(null)
    setStarting(true)

    const handleScan = (decoded: string) => {
      const code = normalizeLookupCode(decoded)
      if (!code) return

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.code === code && now - last.at < 2000) return
      lastScanRef.current = { code, at: now }

      scanner
        .stop()
        .catch(() => {})
        .finally(() => {
          scannerRef.current = null
          onScan(code)
          onClose()
        })
    }

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 12,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const width = Math.min(viewfinderWidth * 0.85, 320)
            const height = Math.min(viewfinderHeight * 0.45, 160)
            return { width, height }
          },
          aspectRatio: 1,
        },
        handleScan,
        () => {},
      )
      .then(() => {
        if (!cancelled) setStarting(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStarting(false)
        const message =
          err instanceof Error ? err.message : 'تعذر تشغيل الكاميرا'
        if (message.includes('NotAllowed') || message.includes('Permission')) {
          setError('يجب السماح بالوصول إلى الكاميرا من إعدادات المتصفح.')
        } else if (message.includes('NotFound')) {
          setError('لم يتم العثور على كاميرا على هذا الجهاز.')
        } else {
          setError('تعذر تشغيل الكاميرا. جرّب متصفح Chrome أو Safari عبر HTTPS.')
        }
      })

    return () => {
      cancelled = true
      const active = scannerRef.current
      scannerRef.current = null
      if (active?.isScanning) {
        active.stop().catch(() => {})
      }
    }
  }, [open, regionId, onClose, onScan])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="إغلاق">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-[var(--text-muted)]">
            {hint ?? 'وجّه الكاميرا نحو الباركود داخل الإطار. يعمل على الهاتف عبر HTTPS.'}
          </p>
          <div className="overflow-hidden rounded-xl bg-black">
            <div id={regionId} className="min-h-[240px] w-full [&_video]:!object-cover" />
          </div>
          {starting && !error && (
            <p className="text-center text-sm text-[var(--text-muted)]">جاري تشغيل الكاميرا...</p>
          )}
          {error && (
            <p className="rounded-xl bg-[var(--danger)]/10 px-3 py-2 text-center text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <Button variant="secondary" className="w-full" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  )
}
