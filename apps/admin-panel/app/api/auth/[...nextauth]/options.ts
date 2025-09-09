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

const providers: Provider[] = [
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
]

if (env.NODE_ENV === "development") {
  providers.push(
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (credentials?.username === "admin" && credentials?.password === "admin") {
          return { id: "1", name: "admin", email: "admintest@blinkbitcoin.test" }
        }
        if (credentials?.username === "alice" && credentials?.password === "alice") {
          return { id: "2", name: "alice", email: "alicetest@blinkbitcoin.test" }
        }
        if (credentials?.username === "bob" && credentials?.password === "bob") {
          return { id: "2", name: "bob", email: "bobtest@blinkbitcoin.test" }
        }
        return null
      },
    }),
  )
}

const callbacks: Partial<CallbacksOptions> = {
  async signIn({ account, profile, user }) {
    if (account?.provider === "credentials" && env.NODE_ENV === "development") {
      return !!user
    }

    if (!account || !profile) {
      return false
    }

    const email = profile?.email
    if (!email) {
      return false
    }

    // eslint-disable-next-line no-new-wrappers
    const verified = new Boolean("email_verified" in profile && profile.email_verified)
    return verified && env.AUTHORIZED_EMAILS.includes(email)
  },
  // https://next-auth.js.org/configuration/callbacks#jwt-callback
  async jwt({ token, user }) {
    const tracer = trace.getTracer("admin-panel-auth")

    return tracer.startActiveSpan("jwt-callback", (span) => {
      span.setAttributes({
        "auth.user_email": user?.email || token.email || "notSet",
        "auth.has_user": !!user,
      })

      let role_mapping: { [key: string]: string[] }
      if (env.NODE_ENV === "development") {
        role_mapping = {
          "admintest@blinkbitcoin.test": ["ADMIN"],
          "alicetest@blinkbitcoin.test": ["VIEWER"],
          "bobtest@blinkbitcoin.test": ["SUPPORTLV1"],
          "caroltest@blinkbitcoin.test": ["SUPPORTLV2", "MARKETING"],
        }
      } else {
        role_mapping = env.USER_ROLE_MAP
      }

      if (user) {
        const userRoles = role_mapping[user.email as keyof typeof role_mapping] || [
          "VIEWER",
        ]

        if (areValidAdminRoles(userRoles)) {
          const accessRights = getAccessRightsForRoles(userRoles as AdminRole[])
          token.scope = JSON.stringify(accessRights)
        } else {
          token.scope = JSON.stringify([])
        }
      } else {
        if (!(token.email && token.scope)) {
          token.scope = JSON.stringify([])
        }
      }

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
