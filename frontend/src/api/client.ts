import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { extractList } from '../lib/apiHelpers'
import type { Store } from '../types'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

let storesFetchPromise: Promise<void> | null = null

async function ensureStoreId(): Promise<number | null> {
  const state = useAuthStore.getState()
  if (!state.accessToken) return null

  if (state.currentStoreId) {
    const valid = state.stores.some((s) => s.id === state.currentStoreId)
    if (valid) return state.currentStoreId
  }

  if (state.stores.length > 0) {
    const id = state.stores[0].id
    useAuthStore.getState().setCurrentStore(id)
    return id
  }

  if (!storesFetchPromise) {
    storesFetchPromise = (async () => {
      try {
        const { data } = await axios.get<Store[] | { results: Store[] }>(`${API_URL}/stores/`, {
          headers: { Authorization: `Bearer ${state.accessToken}` },
        })
        const stores = extractList(data)
        useAuthStore.getState().setStores(stores)
      } finally {
        storesFetchPromise = null
      }
    })()
  }
  await storesFetchPromise

  return useAuthStore.getState().currentStoreId
}

api.interceptors.request.use(async (config) => {
  const { accessToken } = useAuthStore.getState()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  // FormData يحتاج multipart + boundary من المتصفح — لا تُبقِ application/json الافتراضي
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (typeof config.headers.set === 'function') {
      config.headers.set('Content-Type', false as unknown as string)
    } else {
      delete (config.headers as Record<string, unknown>)['Content-Type']
    }
  }

  const isAuth = config.url?.includes('/auth/')
  const isStoresList = config.url === '/stores/' || config.url?.endsWith('/stores/')
  const isCreateStore = config.url?.includes('/stores/create')

  if (accessToken && !isAuth && !isCreateStore) {
    const storeId = isStoresList ? useAuthStore.getState().currentStoreId : await ensureStoreId()
    if (storeId) {
      config.headers['X-Store-Id'] = String(storeId)
    }
  }

  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      const refresh = useAuthStore.getState().refreshToken
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh/`, { refresh })
          useAuthStore.getState().setTokens(data.access, refresh)
          original.headers.Authorization = `Bearer ${data.access}`
          return api(original)
        } catch {
          useAuthStore.getState().logout()
        }
      }
    }
    return Promise.reject(error)
  },
)

async function messageFromBlob(blob: Blob): Promise<string | null> {
  try {
    const text = await blob.text()
    if (!text) return null
    try {
      const json = JSON.parse(text) as Record<string, unknown>
      if (json.detail) return String(json.detail)
      const nonField = json.non_field_errors
      if (Array.isArray(nonField) && nonField[0]) return String(nonField[0])
    } catch {
      if (text.length <= 200 && !text.includes('<!DOCTYPE') && !text.includes('<html')) {
        return text
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Sync helper — Blob bodies need getErrorMessageAsync for full detail. */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message && !axios.isAxiosError(error)) {
    return error.message
  }
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | string | Blob | undefined
    if (data instanceof Blob) {
      return 'فشل الطلب — راجع رسالة الخطأ أو حدّث الباك اند.'
    }
    if (!data) {
      if (error.code === 'ERR_NETWORK' || !error.response) {
        return 'فشل الاتصال بالخادم. تحقق من api.mobishop.online أو أعد تسجيل الدخول.'
      }
      return `خطأ من الخادم (${error.response.status})`
    }
    if (typeof data === 'string') {
      if (data.includes('Server Error (500)')) {
        return 'خطأ داخلي في الخادم (500). راجع إعدادات API أو سجّل الأخطاء.'
      }
      if (data.includes('Not Found') || data.includes('<!doctype html>')) {
        if (error.response?.status === 404) {
          return 'الميزة غير متوفرة على الخادم — ارفع آخر نسخة من backend-full.zip وأعد تشغيل التطبيق.'
        }
        return 'حدث خطأ في الخادم'
      }
      return data.length > 200 ? 'حدث خطأ في الخادم' : data
    }

    if (data.detail) {
      return translateAuthMessage(String(data.detail))
    }
    const nonField = data.non_field_errors
    if (Array.isArray(nonField) && nonField[0]) return translateAuthMessage(String(nonField[0]))
    if (typeof nonField === 'string') return translateAuthMessage(nonField)

    const errors = data.errors as Record<string, unknown> | undefined
    if (errors && typeof errors === 'object') {
      const fromNested = firstFieldMessage(errors)
      if (fromNested) return fromNested
    }
    const fromFields = firstFieldMessage(data)
    if (fromFields) return fromFields
  }
  return 'حدث خطأ غير متوقع'
}

/** Like getErrorMessage but parses Blob error bodies (e.g. PDF downloads). */
export async function getErrorMessageAsync(error: unknown): Promise<string> {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data instanceof Blob) {
      const fromBlob = await messageFromBlob(data)
      if (fromBlob) return fromBlob
      const status = error.response?.status
      if (status) return `خطأ من الخادم (${status}) عند تحميل الملف`
    }
  }
  return getErrorMessage(error)
}

/** Extract per-field validation errors for forms (register/login/etc). */
export function getFieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!axios.isAxiosError(error)) return out
  const data = error.response?.data
  if (!data || typeof data !== 'object' || data instanceof Blob) return out

  const source =
    'errors' in data && data.errors && typeof data.errors === 'object'
      ? (data.errors as Record<string, unknown>)
      : (data as Record<string, unknown>)

  for (const [key, val] of Object.entries(source)) {
    if (key === 'detail' || key === 'errors') continue
    if (Array.isArray(val) && val[0] != null) {
      out[key] = translateAuthMessage(String(val[0]))
    } else if (typeof val === 'string') {
      out[key] = translateAuthMessage(val)
    }
  }
  return out
}

const FIELD_LABELS: Record<string, string> = {
  username: 'اسم المستخدم',
  email: 'البريد الإلكتروني',
  password: 'كلمة المرور',
  password_confirm: 'تأكيد كلمة المرور',
  phone: 'الجوال',
  first_name: 'الاسم الأول',
  last_name: 'اسم العائلة',
  non_field_errors: '',
}

function firstFieldMessage(data: Record<string, unknown>): string | null {
  for (const [key, val] of Object.entries(data)) {
    if (key === 'errors' || key === 'detail') continue
    let msg: string | null = null
    if (Array.isArray(val) && val[0] != null) msg = String(val[0])
    else if (typeof val === 'string') msg = val
    if (!msg) continue
    msg = translateAuthMessage(msg)
    const label = FIELD_LABELS[key]
    if (label) return `${label}: ${msg}`
    if (key === 'non_field_errors') return msg
    return msg
  }
  return null
}

function translateAuthMessage(msg: string): string {
  const lower = msg.toLowerCase()
  if (lower.includes('no active account') || lower.includes('unable to log in')) {
    return 'اسم المستخدم أو كلمة المرور غير صحيحة.'
  }
  if (lower.includes('token') && (lower.includes('invalid') || lower.includes('expired'))) {
    return 'انتهت صلاحية الجلسة. سجّل الدخول مجدداً.'
  }
  if (
    lower.includes('already exists') ||
    lower.includes('user with that username') ||
    msg.includes('مستخدم بهذا الاسم')
  ) {
    if (lower.includes('email') || msg.includes('بريد')) {
      return 'هذا البريد الإلكتروني مستخدم مسبقاً.'
    }
    return 'اسم المستخدم مستخدم مسبقاً.'
  }
  if (lower.includes('enter a valid email') || lower.includes('valid email')) {
    return 'أدخل بريداً إلكترونياً صالحاً.'
  }
  if (lower.includes('this field is required') || lower.includes('may not be blank')) {
    return 'هذا الحقل مطلوب.'
  }
  if (lower.includes('at least') && lower.includes('characters')) {
    return 'كلمة المرور قصيرة جداً (8 أحرف على الأقل).'
  }
  if (lower.includes('too common') || lower.includes('entirely numeric')) {
    return 'كلمة المرور ضعيفة جداً. اختر كلمة أقوى.'
  }
  if (lower.includes('password') && lower.includes('similar')) {
    return 'كلمة المرور مشابهة جداً لبياناتك الشخصية.'
  }
  return msg
}
