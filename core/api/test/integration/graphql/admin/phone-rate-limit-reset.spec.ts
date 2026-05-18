import { ApolloServer } from "@apollo/server"

import { gqlAdminSchema } from "@/graphql/admin"

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

  beforeAll(async () => {
    server = new ApolloServer<GraphQLAdminContext>({
      schema: gqlAdminSchema,
    })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  it("resets rate limit via GraphQL", async () => {
    const result = await server.executeOperation(
      {
        query: PHONE_RATE_LIMIT_RESET_MUTATION,
        variables: {
          input: {
            phone: "+14155550123",
          },
        },
        // Resolver does not use context; this keeps the schema-level test focused.
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
