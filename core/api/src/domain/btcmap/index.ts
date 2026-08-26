import { InvalidBtcMapCategoryError, InvalidBtcMapPlaceNameError } from "./errors"

export const checkedBtcMapCategory = (
  category: string,
): BtcMapCategory | InvalidBtcMapCategoryError => {
  const trimmed = category.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > 50 ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)
  ) {
    return new InvalidBtcMapCategoryError()
  }
  return trimmed as BtcMapCategory
}

export const checkedBtcMapPlaceName = (
  name: string,
): BtcMapPlaceName | InvalidBtcMapPlaceNameError => {
  const trimmed = name.trim()
  if (trimmed.length < 3 || trimmed.length > 100) {
    return new InvalidBtcMapPlaceNameError()
  }
  return trimmed as BtcMapPlaceName
}
