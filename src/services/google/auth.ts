import type { TokenGetter } from './sheetsApi'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

// Token lives in memory only; a reload means signing in again (usually one tap).
let cached: { token: string; expiresAt: number } | null = null
let pending: Promise<string> | null = null
let client: google.accounts.oauth2.TokenClient | null = null
let settle: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
let gisLoaded: Promise<void> | null = null

function loadGis(): Promise<void> {
  gisLoaded ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gisLoaded = null
      reject(new Error('Could not load Google sign-in.'))
    }
    document.head.appendChild(script)
  })
  return gisLoaded
}

function getClient(): google.accounts.oauth2.TokenClient {
  client ??= google.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (res) => {
      if (res.error || !res.access_token) {
        settle?.reject(new Error(res.error_description ?? res.error ?? 'Sign-in failed.'))
      } else {
        cached = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 }
        settle?.resolve(res.access_token)
      }
    },
    error_callback: (err) => settle?.reject(new Error(err.message ?? `Sign-in ${err.type}.`)),
  })
  return client
}

export const getToken: TokenGetter = async (opts) => {
  if (!opts?.forceRefresh && cached && cached.expiresAt - 60_000 > Date.now()) return cached.token
  pending ??= (async () => {
    await loadGis()
    return new Promise<string>((resolve, reject) => {
      settle = { resolve, reject }
      getClient().requestAccessToken({ prompt: '' })
    })
  })().finally(() => {
    pending = null
    settle = null
  })
  return pending
}

export function signOut(): void {
  if (cached) google.accounts.oauth2.revoke(cached.token)
  cached = null
}
