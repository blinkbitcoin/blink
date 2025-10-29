import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  /*
   * Serverside Environment variables, not available on the client.
   * Will throw if you access these variables on the client.
   */
  server: {
    GOOGLE_CLIENT_ID: z.string().min(1).default("googleId"),
    GOOGLE_CLIENT_SECRET: z.string().min(1).default("googleSecret"),
    ADMIN_CORE_API: z.string().url().default("http://localhost:4455/admin/graphql"),
    NEXTAUTH_URL: z.string().url().default("http://localhost:3004"),
    NEXTAUTH_SECRET: z.string().min(8).default("nextAuthSecret"),
    AUTHORIZED_EMAILS: z
      .string()
      .transform((x) => x.split(",").map((email) => email.trim()))
      .default("test@galoy.io"),
    USER_ROLE_MAP: z
      .string()
      .transform((str) => {
        try {
          const parsed = JSON.parse(str)
          // Normalize the parsed object to support both single roles and arrays
          const normalized: { [key: string]: string[] } = {}
          for (const [email, roles] of Object.entries(parsed)) {
            if (typeof roles === "string") {
              // Convert single role string to array
              normalized[email] = [roles]
            } else if (Array.isArray(roles)) {
              // Keep arrays as is
              normalized[email] = roles
            } else {
              throw new Error(
                `Invalid role format for ${email}: must be string or array of strings`,
              )
            }
          }
          return normalized
        } catch (error) {
          throw new Error(
            `Invalid JSON in USER_ROLE_MAP environment variable: ${
              error instanceof Error ? error.message : "Unknown parsing error"
            }`,
          )
        }
      })
      .default("{}"),
  },
  /*
   * Environment variables available on the client (and server).
   *
   * 💡 You'll get type errors if these are not prefixed with NEXT_PUBLIC_.
   */
  client: {},
  shared: {
    NODE_ENV: z.string(),
  },
  /*
   * Due to how Next.js bundles environment variables on Edge and Client,
   * we need to manually destructure them to make sure all are included in bundle.
   *
   * 💡 You'll get type errors if not all variables from `server` & `client` are included here.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    ADMIN_CORE_API: process.env.ADMIN_CORE_API,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    AUTHORIZED_EMAILS: process.env.AUTHORIZED_EMAILS,
    USER_ROLE_MAP: process.env.USER_ROLE_MAP || "{}",
  },
})
