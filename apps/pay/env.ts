import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

// URL base values are interpolated as `${BASE}/${path}` — strip trailing
// slashes at parse time so a misconfigured value can't produce "//" in URLs.
const urlWithoutTrailingSlash = z.string().transform((s) => s.replace(/\/+$/, ""))

export const env = createEnv({
  server: {
    CORE_GQL_URL_INTRANET: z.string().default("http://localhost:4455/graphql"), // Use intranet URL to preserve tracing headers
    NOSTR_PUBKEY: z.string().optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_MASTER_NAME: z.string().optional(),
    REDIS_0_DNS: z.string().optional(),
    REDIS_1_DNS: z.string().optional(),
    REDIS_2_DNS: z.string().optional(),
    // hydra
    CLIENT_ID: z.string().default("CLIENT_ID"),
    CLIENT_SECRET: z.string().default("CLIENT_SECRET"),
    HYDRA_PUBLIC: z.string().default("http://localhost:4444"),
    NEXTAUTH_URL: z.string().default(""),
    NEXTAUTH_SECRET: z.string().default("secret"),
    // Non-custodial migration: when a username is deactivated on custodial Blink
    // (migrated to a non-custodial account), look it up on the lnurl-server via
    // this well-known host and, if registered, redirect to Blink Terminal.
    WELL_KNOWN_LNURL_URL: urlWithoutTrailingSlash.default("https://blink.sv"),
    BLINK_TERMINAL_URL: urlWithoutTrailingSlash.default("https://terminal.blinkbtc.com"),
  },
  // DO NOT USE THESE, EXCEPT FOR LOCAL DEVELOPMENT
  client: {
    NEXT_PUBLIC_CORE_GQL_URL: z.string().optional(),
    NEXT_PUBLIC_CORE_GQL_WEB_SOCKET_URL: z.string().optional(),
    NEXT_PUBLIC_PAY_DOMAIN: z.string().optional(),
  },
  runtimeEnv: {
    CORE_GQL_URL_INTRANET: process.env.CORE_GQL_URL_INTRANET,
    NEXT_PUBLIC_CORE_GQL_URL: process.env.NEXT_PUBLIC_CORE_GQL_URL,
    NEXT_PUBLIC_CORE_GQL_WEB_SOCKET_URL: process.env.NEXT_PUBLIC_CORE_GQL_WEB_SOCKET_URL,
    NEXT_PUBLIC_PAY_DOMAIN: process.env.NEXT_PUBLIC_PAY_DOMAIN,
    NOSTR_PUBKEY: process.env.NOSTR_PUBKEY, // Optional but required for Nostr Zaps
    REDIS_PASSWORD: process.env.REDIS_PASSWORD, // Optional but required for Nostr Zaps
    REDIS_MASTER_NAME: process.env.REDIS_MASTER_NAME, // Optional but required for Nostr Zaps
    REDIS_0_DNS: process.env.REDIS_0_DNS, // Optional but required for Nostr Zaps
    REDIS_1_DNS: process.env.REDIS_1_DNS, // Optional but required for Nostr Zaps
    REDIS_2_DNS: process.env.REDIS_2_DNS, // Optional but required for Nostr Zaps
    CLIENT_ID: process.env.CLIENT_ID,
    CLIENT_SECRET: process.env.CLIENT_SECRET,
    HYDRA_PUBLIC: process.env.HYDRA_PUBLIC,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    WELL_KNOWN_LNURL_URL: process.env.WELL_KNOWN_LNURL_URL,
    BLINK_TERMINAL_URL: process.env.BLINK_TERMINAL_URL,
  },
})
