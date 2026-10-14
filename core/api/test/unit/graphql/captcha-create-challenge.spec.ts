jest.mock("@/app/captcha", () => ({ registerCaptchaGeetest: jest.fn() }))

import { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql"

import { registerCaptchaGeetest } from "@/app/captcha"
import { CaptchaServiceUnavailableError } from "@/domain/captcha/errors"
import CaptchaCreateChallengeMutation from "@/graphql/public/root/mutation/captcha-create-challenge"
import GraphQLApplicationError from "@/graphql/shared/types/object/graphql-application-error"

// Execute the real mutation, payload types and error mapping without loading
// unrelated application services from the complete public schema.
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: { unused: { type: GraphQLString } },
  }),
  mutation: new GraphQLObjectType({
    name: "Mutation",
    fields: { captchaCreateChallenge: CaptchaCreateChallengeMutation },
  }),
  types: [GraphQLApplicationError],
})
const source = `mutation {
  captchaCreateChallenge {
    errors { message code }
    result { id challengeCode newCaptcha failbackMode }
  }
}`
const register = registerCaptchaGeetest as jest.Mock

beforeEach(() => register.mockReset())

describe("captchaCreateChallenge", () => {
  it("returns an online challenge with the wire-compatible failbackMode false", async () => {
    register.mockResolvedValue({
      success: 1,
      gt: "gt-id",
      challenge: "online-challenge",
      newCaptcha: true,
    })

    const response = await graphql({ schema, source })

    expect(response.errors).toBeUndefined()
    expect(response.data).toEqual({
      captchaCreateChallenge: {
        errors: [],
        result: {
          id: "gt-id",
          challengeCode: "online-challenge",
          newCaptcha: true,
          failbackMode: false,
        },
      },
    })
    expect(register).toHaveBeenCalledTimes(1)
  })

  it("returns CAPTCHA_UNAVAILABLE without a challenge during a provider outage", async () => {
    register.mockResolvedValue(new CaptchaServiceUnavailableError())

    const response = await graphql({ schema, source })

    expect(response.errors).toBeUndefined()
    expect(response.data).toEqual({
      captchaCreateChallenge: {
        errors: [
          {
            code: "CAPTCHA_UNAVAILABLE",
            message: "Captcha provider is unavailable. Please try again later.",
          },
        ],
        result: null,
      },
    })
    expect(register).toHaveBeenCalledTimes(1)
  })
})
