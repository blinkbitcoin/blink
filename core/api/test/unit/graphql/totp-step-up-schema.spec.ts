import { GraphQLInputObjectType, getNamedType } from "graphql"

import { gqlPublicSchema } from "@/graphql/public"
import { TOTP_STEP_UP_MUTATIONS } from "@/servers/middlewares/totp-step-up"

describe("public schema - TOTP step-up inputs", () => {
  const mutationFields = gqlPublicSchema.getMutationType()?.getFields() ?? {}

  it.each(TOTP_STEP_UP_MUTATIONS)("%s accepts input.totpCode", (name) => {
    const field = mutationFields[name]
    expect(field).toBeDefined()

    const input = field.args.find((arg) => arg.name === "input")
    expect(input).toBeDefined()

    const inputType = getNamedType(input?.type)
    expect(inputType).toBeInstanceOf(GraphQLInputObjectType)
    expect((inputType as GraphQLInputObjectType).getFields().totpCode).toBeDefined()
  })
})
