// Returns a normalized return URL only for absolute https URLs without credentials; null otherwise.
export const safeReturnUrl = (value: string | null | undefined): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}
