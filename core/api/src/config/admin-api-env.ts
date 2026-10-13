import { z } from "zod"

// Fails closed: unset means "galoy-admin", and an empty or whitespace-only value
// is a startup error rather than a way to switch the audience check off.
export const adminApiJwtAudienceSchema = z.string().trim().min(1).default("galoy-admin")
