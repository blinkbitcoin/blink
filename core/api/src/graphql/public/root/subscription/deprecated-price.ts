// Both deprecated price entry points (the `price` subscription and the `price` branch of
// `myUpdates`) reject non-USD payloads with this message. Keeping it in one leaf module —
// no imports, so tests can assert against it without mocking the GraphQL layer — means the
// two guards provably agree instead of drifting apart.
export const PRICE_DEPRECATED_MESSAGE =
  "Price is deprecated, please use realtimePrice event"
