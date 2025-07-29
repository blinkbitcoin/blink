import { gql } from "apollo-server-core"
import { createApolloServer } from "@/graphql/server"
import { RateLimitConfig } from "@/domain/rate-limit"
import { RedisRateLimitService } from "@/services/rate-limit"

const RATE_LIMIT_RESET_MUTATION = gql`
  mutation RateLimitReset($input: RateLimitResetInput!) {
    rateLimitReset(input: $input) {
      errors {
        message
      }
      success
    }
  }
`

describe("RateLimitReset GraphQL", () => {
  let server: any

  beforeAll(async () => {
    server = await createApolloServer()
  })

  it("resets rate limit via GraphQL", async () => {
    const keyToConsume = "testAccount" as AccountId
    const rateLimitConfig = RateLimitConfig.invoiceCreate
    const resetKey = `${rateLimitConfig.key}:${keyToConsume}`

    const result = await server.executeOperation({
      query: RATE_LIMIT_RESET_MUTATION,
      variables: {
        input: {
          key: resetKey,
        },
      },
    })

    expect(result.errors).toBeUndefined()
    expect(result.data?.rateLimitReset.success).toBe(true)
    expect(result.data?.rateLimitReset.errors).toHaveLength(0)
  })

  it("returns error for invalid key", async () => {
    const result = await server.executeOperation({
      query: RATE_LIMIT_RESET_MUTATION,
      variables: {
        input: {
          key: "invalid:key:format",
        },
      },
    })

    expect(result.data?.rateLimitReset.success).toBe(false)
    expect(result.data?.rateLimitReset.errors).toHaveLength(1)
  })
})