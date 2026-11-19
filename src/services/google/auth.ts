import type { TokenGetter } from './sheetsApi'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

// Token is kept in sessionStorage so a reload in the same tab stays signed in until it expires (~1h).
const STORAGE_KEY = 'shiniri.token'
type Cached = { token: string; expiresAt: number }

function readStored(): Cached | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Cached | null
    return c && typeof c.token === 'string' && typeof c.expiresAt === 'number' ? c : null
  } catch {
    return null
  }
}

function store(c: Cached | null): void {
  cached = c
  try {
    if (c) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private mode etc.): memory-only, same as before.
  }
}

let cached: Cached | null = readStored()
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
        store({ token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 })
        settle?.resolve(res.access_token)
      }
    },
    error_callback: (err) => settle?.reject(new Error(err.message ?? `Sign-in ${err.type}.`)),
  })
  return client
}

// Refresh 5 min early: Save fetches a token first thing in the tap, and the token must then outlive
// the duplicate-confirm dialog, since a refresh after the tap can have its popup blocked.
const isFresh = (c: Cached | null): c is Cached => !!c && c.expiresAt - 5 * 60_000 > Date.now()
const SIGN_IN_TIMEOUT_MS = 2 * 60_000

export const hasFreshToken = (): boolean => isFresh(cached)

export const getToken: TokenGetter = async (opts) => {
  if (!opts?.forceRefresh && isFresh(cached)) return cached.token
  pending ??= (async () => {
    await loadGis()
    let timer: ReturnType<typeof setTimeout> | undefined
    return new Promise<string>((resolve, reject) => {
      settle = { resolve, reject }
      // A popup left open fires neither callback; give up so Save doesn't hang.
      timer = setTimeout(
        () => reject(new Error('Sign-in timed out. Try again.')),
        SIGN_IN_TIMEOUT_MS,
      )
      getClient().requestAccessToken({ prompt: '' })
    }).finally(() => clearTimeout(timer))
  })().finally(() => {
    pending = null
    settle = null
  })
  return pending
}

export function signOut(): void {
  // GIS may not be loaded yet when the token came from storage.
  if (cached && typeof google !== 'undefined') google.accounts.oauth2.revoke(cached.token)
  store(null)
}
