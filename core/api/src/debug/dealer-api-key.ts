/**
 * how to run:
 *
 * pnpm tsx src/debug/dealer-api-key.ts
 *
 * Creates an API key for the dealer account via the supergraph.
 */

import axios from "axios"

import { isUp } from "@/services/lnd/health"
import { lndsConnect } from "@/services/lnd/auth"
import { setupMongoConnection } from "@/services/mongodb"
import { Account } from "@/services/mongoose/schema"

const GRAPHQL_URL = process.env.GRAPHQL_URL || "http://localhost:4455/graphql"

const main = async () => {
  // 1. Get dealer account info
  console.log(`graphql url: ${GRAPHQL_URL}`)
  const dealerAccount = await Account.findOne({ role: "dealer" })

  if (!dealerAccount) {
    console.error("❌ Dealer account not found")
    return
  }

  console.log(`\n✅ Found dealer account`)
  console.log(`Account ID: ${dealerAccount.id}`)
  console.log(`Kratos User ID: ${dealerAccount.kratosUserId}`)

  const { UsersRepository } = await import("@/services/mongoose")
  const user = await UsersRepository().findById(dealerAccount.kratosUserId as UserId)

  if (user instanceof Error) {
    console.error("❌ Could not find user:", user)
    return
  }

  const phone = user.phone || "+15555550000"
  console.log(`Phone: ${phone}`)

  // 2. Login with phone and code to get auth token
  console.log(`\n🔐 Logging in with phone and code 000000...`)
  const loginRes = await axios.post(GRAPHQL_URL, {
    query: `
      mutation UserLogin($phone: Phone!, $code: OneTimeAuthCode!) {
        userLogin(input: { phone: $phone, code: $code }) {
          authToken
          errors {
            message
          }
        }
      }
    `,
    variables: {
      phone,
      code: "000000",
    },
  })

  if (loginRes.data.errors) {
    console.error("❌ GraphQL Errors:", loginRes.data.errors)
    return
  }

  const loginPayload = loginRes.data.data.userLogin
  if (loginPayload.errors && loginPayload.errors.length > 0) {
    console.error("❌ Login Errors:", loginPayload.errors)

    // If login failed because account doesn't exist, we need to get the correct kratosUserId
    const errorMsg = loginPayload.errors[0]?.message || ""
    if (errorMsg.includes("CouldNotFindAccountFromKratosIdError")) {
      console.log(`\n⚠️  Account mismatch detected. Fetching current user info...`)

      // Get the Kratos identity for this phone to find the correct kratosUserId
      const { kratosAdmin } = await import("@/services/kratos/private")
      const identities = await kratosAdmin.listIdentities({
        credentialsIdentifier: phone,
      })

      if (identities.data && identities.data.length > 0) {
        const correctKratosUserId = identities.data[0].id
        console.log(`Found Kratos identity: ${correctKratosUserId}`)
        console.log(`Current dealer kratosUserId: ${dealerAccount.kratosUserId}`)
        console.log(`\n🔄 Updating dealer account with correct Kratos User ID...`)

        dealerAccount.kratosUserId = correctKratosUserId
        await dealerAccount.save()
        console.log(`✅ Dealer account updated`)

        // Retry login
        console.log(`\n🔐 Retrying login...`)
        const retryLoginRes = await axios.post(GRAPHQL_URL, {
          query: `
            mutation UserLogin($phone: Phone!, $code: OneTimeAuthCode!) {
              userLogin(input: { phone: $phone, code: $code }) {
                authToken
                errors {
                  message
                }
              }
            }
          `,
          variables: {
            phone,
            code: "000000",
          },
        })

        if (
          retryLoginRes.data.errors ||
          retryLoginRes.data.data.userLogin.errors?.length > 0
        ) {
          console.error("❌ Login still failed after update")
          return
        }

        const authToken = retryLoginRes.data.data.userLogin.authToken
        console.log(`✅ Logged in successfully`)

        // Continue with API key creation
        await createApiKey(authToken)
        return
      } else {
        console.error("❌ Could not find Kratos identity for phone:", phone)
        return
      }
    }
    return
  }

  const authToken = loginPayload.authToken
  console.log(`✅ Logged in successfully`)

  await createApiKey(authToken)
}

async function createApiKey(authToken: string) {
  // 3. Create API key via supergraph
  console.log(`\n🔑 Creating API key...`)
  const gqlRes = await axios.post(
    GRAPHQL_URL,
    {
      query: `
        mutation {
          apiKeyCreate(input: {
            name: "dealer-service-key"
            expireInDays: 365
            scopes: [READ, WRITE, RECEIVE]
          }) {
            apiKey { id name scopes expiresAt }
            apiKeySecret
          }
        }
      `,
    },
    { headers: { Authorization: `Bearer ${authToken}` } },
  )

  if (gqlRes.data.errors) {
    console.error("❌ GraphQL Errors:", gqlRes.data.errors)
    return
  }

  const { apiKey, apiKeySecret } = gqlRes.data.data.apiKeyCreate
  console.log(`\n✅ API Key created!`)
  console.log(`\nSecret: ${apiKeySecret}`)
  console.log(`ID: ${apiKey.id}`)
  console.log(`Scopes: ${apiKey.scopes.join(", ")}`)
}

setupMongoConnection()
  .then(async (mongoose) => {
    await Promise.all(lndsConnect.map((lndParams) => isUp(lndParams)))
    await main()
    if (mongoose) await mongoose.connection.close()
  })
  .catch((err) => console.log(err))
