export const parseErrorMessageFromUnknown = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || error.name
  }

  if (typeof error === "string") {
    return error
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = error.message
    if (typeof message === "string") {
      return message
    }
  }

  if (error instanceof Object) {
    return JSON.stringify(error)
  }

  return "Unknown error"
}

export const parseErrorFromUnknown = (error: unknown): Error => {
  const err =
    error instanceof Error
      ? error
      : typeof error === "string"
        ? new Error(error)
        : error instanceof Object
          ? new Error(JSON.stringify(error))
          : new Error("Unknown error")
  return err
}
