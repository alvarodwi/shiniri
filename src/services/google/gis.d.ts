// Minimal typings for the parts of Google Identity Services this app uses.
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string
    expires_in: number
    error?: string
    error_description?: string
  }
  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string }): void
  }
  function initTokenClient(config: {
    client_id: string
    scope: string
    callback: (res: TokenResponse) => void
    error_callback?: (err: { type: string; message?: string }) => void
  }): TokenClient
  function revoke(token: string, done?: () => void): void
}
