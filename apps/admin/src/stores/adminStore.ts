import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AdminState {
  token: string | null
  user: { id: string; name: string; role: string } | null
  setAuth: (token: string, user: AdminState['user']) => void
  clearAuth: () => void
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => {
        localStorage.setItem('adminToken', token)
        set({ token, user })
      },
      clearAuth: () => {
        localStorage.removeItem('adminToken')
        set({ token: null, user: null })
      },
    }),
    { name: 'ride-admin' }
  )
)
