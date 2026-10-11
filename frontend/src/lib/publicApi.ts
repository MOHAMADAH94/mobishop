import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

/** طلبات عامة بدون مصادقة — للكتالوج العام فقط */
export const publicApi = axios.create({
  baseURL: API_URL,
})
