import { ApolloServer } from "@apollo/server"

import { RateLimitConfig } from "@/domain/rate-limit"
import { gqlAdminSchema } from "@/graphql/admin"
import { RedisRateLimitService, resetLimiter } from "@/services/rate-limit"

const PHONE_RATE_LIMIT_RESET_MUTATION = `
  mutation PhoneRateLimitReset($input: PhoneRateLimitResetInput!) {
    phoneRateLimitReset(input: $input) {
      errors {
        message
      }
      success
    }
  }
`

type PhoneRateLimitResetData = {
  phoneRateLimitReset: {
    errors: { message: string }[]
    success: boolean
  }
}

describe("PhoneRateLimitReset GraphQL", () => {
  let server: ApolloServer<GraphQLAdminContext>
  const phone = "+14155550123" as PhoneNumber
  const phoneRateLimitConfigs = [
    RateLimitConfig.requestCodeAttemptPerPhoneNumber,
    RateLimitConfig.loginAttemptPerLoginIdentifier,
  ]

  beforeAll(async () => {
    server = new ApolloServer<GraphQLAdminContext>({
      schema: gqlAdminSchema,
    })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {
    for (const rateLimitConfig of phoneRateLimitConfigs) {
      await resetLimiter({
        rateLimitConfig,
        keyToConsume: phone,
      })
    }
  })

  it("resets phone auth rate limits via GraphQL", async () => {
    for (const rateLimitConfig of phoneRateLimitConfigs) {
      const rateLimit = RedisRateLimitService({
        keyPrefix: rateLimitConfig.key,
        limitOptions: rateLimitConfig.limits,
      })

      for (let i = 0; i < rateLimitConfig.limits.points; i++) {
        await rateLimit.consume(phone)
      }

      const exceededResult = await rateLimit.consume(phone)
      expect(exceededResult).toBeInstanceOf(Error)
    }

    const result = await server.executeOperation(
      {
        query: PHONE_RATE_LIMIT_RESET_MUTATION,
        variables: {
          input: {
            phone,
          },
        },
      },
      {
        contextValue: {} as GraphQLAdminContext,
      },
    )

    expect(result.body.kind).toBe("single")
    if (result.body.kind !== "single") return
    expect(result.body.singleResult.errors).toBeUndefined()
    const data = result.body.singleResult.data as PhoneRateLimitResetData
    expect(data.phoneRateLimitReset.success).toBe(true)
    expect(data.phoneRateLimitReset.errors).toHaveLength(0)

    for (const rateLimitConfig of phoneRateLimitConfigs) {
      const rateLimit = RedisRateLimitService({
        keyPrefix: rateLimitConfig.key,
        limitOptions: rateLimitConfig.limits,
      })

      const afterResetResult = await rateLimit.consume(phone)
      expect(afterResetResult).not.toBeInstanceOf(Error)
    }
  })

  it("returns error for invalid phone", async () => {
    const result = await server.executeOperation(
      {
        query: PHONE_RATE_LIMIT_RESET_MUTATION,
        variables: {
          input: {
            phone: "invalid-phone",
          },
        },
      },
      {
        contextValue: {} as GraphQLAdminContext,
      },
    )

    expect(result.body.kind).toBe("single")
    if (result.body.kind !== "single") return
    const data = result.body.singleResult.data as PhoneRateLimitResetData
    expect(data.phoneRateLimitReset.success).toBe(false)
    expect(data.phoneRateLimitReset.errors).toHaveLength(1)
  })
})
