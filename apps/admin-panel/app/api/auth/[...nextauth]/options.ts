import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import type { Provider } from "next-auth/providers"

import { CallbacksOptions } from "next-auth"
import { trace } from "@opentelemetry/api"

import { env } from "../../../env"
import {
  getAccessRightsForRoles,
  areValidAdminRoles,
  type AdminRole,
} from "../../../access-rights"

declare module "next-auth" {
  interface Session {
    sub: string | null
    accessToken: string
    scope: string
  }
}

const DEV_CREDENTIALS: Record<string, { id: string; name: string; email: string }> = {
  admin: { id: "1", name: "admin", email: "admintest@blinkbitcoin.test" },
  alice: { id: "2", name: "alice", email: "alicetest@blinkbitcoin.test" },
  bob: { id: "3", name: "bob", email: "bobtest@blinkbitcoin.test" },
  carol: { id: "4", name: "carol", email: "caroltest@blinkbitcoin.test" },
}

const DEV_ROLE_MAPPING: Record<string, string[]> = {
  "admintest@blinkbitcoin.test": ["ADMIN"],
  "alicetest@blinkbitcoin.test": ["VIEWER"],
  "bobtest@blinkbitcoin.test": ["SUPPORTLV1"],
  "caroltest@blinkbitcoin.test": ["SUPPORTLV2", "MARKETING_GLOBAL"],
}

const providers: Provider[] = []

if (env.NODE_ENV !== "development") {
  providers.push(
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  )
}

if (env.NODE_ENV === "development") {
  providers.push(
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const username = credentials?.username ?? ""
        const match = DEV_CREDENTIALS[username]
        return match && credentials?.password === username ? match : null
      },
    }),
  )
}

const callbacks: Partial<CallbacksOptions> = {
  async signIn({ account, profile, user }) {
    if (account?.provider === "credentials" && env.NODE_ENV === "development") {
      return !!user
    }

    const email = profile?.email
    if (!account || !profile || !email) return false

    const isVerified = "email_verified" in profile && !!profile.email_verified
    return isVerified && env.AUTHORIZED_EMAILS.includes(email)
  },
  // https://next-auth.js.org/configuration/callbacks#jwt-callback
  async jwt({ token, user }) {
    const tracer = trace.getTracer("admin-panel-auth")

    return tracer.startActiveSpan("jwt-callback", (span) => {
      span.setAttributes({
        "auth.user_email": user?.email ?? token.email ?? "notSet",
        "auth.has_user": !!user,
      })

      const roleMapping =
        env.NODE_ENV === "development" ? DEV_ROLE_MAPPING : env.USER_ROLE_MAP

      const nextScope = (() => {
        if (!user) return token.email && token.scope ? String(token.scope) : ""

        const userRoles = roleMapping[user.email as string] ?? ["VIEWER"]
        return areValidAdminRoles(userRoles)
          ? getAccessRightsForRoles(userRoles as AdminRole[]).join(" ")
          : ""
      })()

      token.scope = nextScope

      span.setAttributes({
        "auth.has_scope": !!token.scope,
      })

      span.end()
      return token
    })
  },
  // https://next-auth.js.org/configuration/callbacks#session-callback
  async session({ session, token }) {
    session.scope = token.scope as string
    return session
  },
}

export const authOptions = {
  providers,
  callbacks,
}
