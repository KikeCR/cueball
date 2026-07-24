const STORAGE_KEY = "cueball:auth"

export function getStoredUserToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeUserToken(token: string): void {
  window.localStorage.setItem(STORAGE_KEY, token)
}

export function clearUserToken(): void {
  window.localStorage.removeItem(STORAGE_KEY)
}
