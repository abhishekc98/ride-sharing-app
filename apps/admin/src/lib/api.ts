import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3100',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// A stored token that's expired (401) or belongs to a non-admin account
// (403 — happens when the phone was already registered under another role;
// see apps/admin/src/app/login/page.tsx) is useless here — every admin
// endpoint will keep rejecting it. Bounce straight to login instead of
// leaving every page's data silently empty with no explanation.
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (typeof window !== 'undefined' && (error.response?.status === 401 || error.response?.status === 403)) {
      localStorage.removeItem('adminToken')
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)
