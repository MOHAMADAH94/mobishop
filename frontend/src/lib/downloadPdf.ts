import { api, getErrorMessageAsync } from '../api/client'

export async function downloadPdf(url: string, filename: string): Promise<void> {
  const { data } = await api.get(url, { responseType: 'blob' })
  const raw = data as Blob
  if (raw.type?.includes('json') || (raw.size < 400 && raw.type !== 'application/pdf')) {
    const text = await raw.text()
    try {
      const json = JSON.parse(text)
      throw new Error(String(json.detail || 'فشل تحميل PDF'))
    } catch (e) {
      if (e instanceof Error && e.message !== 'فشل تحميل PDF') throw e
      throw new Error('فشل تحميل PDF — تأكد من تشغيل الخادم')
    }
  }
  const blob = raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' })
  const objectUrl = URL.createObjectURL(blob)
  const opened = window.open(objectUrl, '_blank')
  if (!opened) {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export async function downloadPdfSafe(url: string, filename: string, onError: (msg: string) => void) {
  try {
    await downloadPdf(url, filename)
  } catch (e) {
    onError(await getErrorMessageAsync(e))
  }
}
