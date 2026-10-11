import { api, getErrorMessage } from '../api/client'

async function parseBlobError(blob: Blob): Promise<string> {
  try {
    const text = await blob.text()
    try {
      const json = JSON.parse(text) as { detail?: string }
      if (json.detail) return String(json.detail)
    } catch {
      if (text.includes('Not Found') || text.includes('404')) {
        return 'الميزة غير متوفرة على الخادم — ارفع آخر نسخة من backend-full.zip وأعد تشغيل التطبيق.'
      }
      if (text.includes('Server Error (500)') || text.includes('Internal Server Error')) {
        return 'خطأ داخلي في الخادم (500). راجع إعدادات API أو سجّل الأخطاء.'
      }
      if (text.length > 0 && text.length < 300 && !text.includes('<!')) return text
    }
  } catch {
    /* ignore */
  }
  return 'فشل التحميل'
}

export async function downloadBlob(
  url: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const response = await api.get(url, { responseType: 'blob', validateStatus: () => true })
  const raw = response.data as Blob
  if (response.status >= 400) {
    throw new Error(await parseBlobError(raw))
  }
  if (raw.type?.includes('json') || (raw.size < 400 && !raw.type?.includes('spreadsheet'))) {
    const msg = await parseBlobError(raw)
    if (msg !== 'فشل التحميل') throw new Error(msg)
    throw new Error('فشل التحميل — تأكد من تشغيل الخادم')
  }
  const blob = raw.type ? raw : new Blob([raw], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export async function downloadBlobSafe(
  url: string,
  filename: string,
  mimeType: string,
  onError: (msg: string) => void,
) {
  try {
    await downloadBlob(url, filename, mimeType)
  } catch (e) {
    onError(getErrorMessage(e))
  }
}
