import { InvalidBtcMapCategoryError } from "./errors"

export const checkedBtcMapCategory = (category: string) => {
  const trimmed = category.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > 50 ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)
  ) {
    return new InvalidBtcMapCategoryError()
  }
  return trimmed
}
