/// <reference types="vite/client" />

declare const __APP_VERSION__: string
// true only under yarn dev:mock (fake in-memory sheet, no Google sign-in)
declare const __MOCK__: boolean

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_JOURNAL_SHEET_ID: string
}
