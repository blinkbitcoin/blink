import { readFileSync } from "fs"
import { join } from "path"

import { GraphQLInputObjectType, buildSchema, getNamedType } from "graphql"

import { TOTP_STEP_UP_MUTATIONS } from "@/servers/middlewares/totp-step-up-mutations"

// the committed SDL is kept equal to the code schema by the check-sdls diff
const sdl = readFileSync(
  join(__dirname, "../../../src/graphql/public/schema.graphql"),
  "utf8",
)

describe("public schema - TOTP step-up inputs", () => {
  const mutationFields = buildSchema(sdl).getMutationType()?.getFields() ?? {}

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
