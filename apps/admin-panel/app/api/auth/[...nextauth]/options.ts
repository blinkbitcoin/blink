import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import type { Provider } from "next-auth/providers"

import { CallbacksOptions } from "next-auth"

import { env } from "../../../env"

declare module "next-auth" {
  interface Session {
    sub: string | null
    accessToken: string
    role: string
    scope: string[]
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
          return { id: "2", name: "bob", email: "alicetest@blinkbitcoin.test" }
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
    console.log("signIn", account, profile, user)
    console.log("-------------------------")
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
  async jwt({ token, account, profile, user }) {
    const role_mapping = env.ROLE_MAPPING
    if (user) {
      // get this from config depending if you prefere scope or role
      token.scope = ["READ", "WRITE"]
      token.role = role_mapping[user.email as keyof typeof role_mapping] || "VIEWER"
    } else {
      console.log("no user")
    }
    return token
  },
  async session({ session, token }) {
    session.scope = token.scope as string[]
    session.role = token.role as string
    return session
  },
}



export const authOptions = {
  providers,
  callbacks,
}
