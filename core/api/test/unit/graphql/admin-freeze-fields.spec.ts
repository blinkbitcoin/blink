import { graphql, GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql"
import { applyMiddleware } from "graphql-middleware"
import { shield } from "graphql-shield"

import { accessRules, freezeFields } from "@/graphql/admin/access-rules"

const basePermissions = {
  userUpdateEmail: accessRules.changeContactsAccount,
  accountUpdateLevel: accessRules.changeLevelAccount,
}

const buildSchema = (frozenFieldNames: string[]) => {
  const field = { type: GraphQLString, resolve: () => "resolved" }
  const schema = new GraphQLSchema({
    query: new GraphQLObjectType({ name: "Query", fields: { ok: field } }),
    mutation: new GraphQLObjectType({
      name: "Mutation",
      fields: { userUpdateEmail: field, accountUpdateLevel: field },
    }),
  })
  return applyMiddleware(
    schema,
    shield(
      { Mutation: freezeFields(basePermissions, frozenFieldNames) },
      { allowExternalErrors: true },
    ),
  )
}

const fullScopeContext = {
  privilegedClientId: "admin@example.com",
  scope: ["CHANGECONTACTS_ACCOUNT", "CHANGELEVEL_ACCOUNT"],
}

const run = (schema: GraphQLSchema, fieldName: string) =>
  graphql({
    schema,
    source: `mutation { ${fieldName} }`,
    contextValue: fullScopeContext,
  })

describe("freezeFields", () => {
  it("rejects a frozen mutation even when the token carries the access right", async () => {
    const result = await run(buildSchema(["userUpdateEmail"]), "userUpdateEmail")

    expect(result.data?.userUpdateEmail).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(result.errors?.[0].message).toBe("userUpdateEmail is temporarily disabled")
    expect(result.errors?.[0].extensions?.code).toBe("OPERATION_RESTRICTED")
  })

  it("leaves mutations that are not frozen untouched", async () => {
    const result = await run(buildSchema(["userUpdateEmail"]), "accountUpdateLevel")

    expect(result.errors).toBeUndefined()
    expect(result.data?.accountUpdateLevel).toBe("resolved")
  })

  it("freezes nothing when the list is empty", async () => {
    const result = await run(buildSchema([]), "userUpdateEmail")

    expect(result.errors).toBeUndefined()
    expect(result.data?.userUpdateEmail).toBe("resolved")
  })

  it("throws on a field name that does not exist", () => {
    expect(() => freezeFields(basePermissions, ["notAnAdminMutation"])).toThrow(
      "Cannot freeze unknown admin field: notAnAdminMutation",
    )
  })

  it("does not mutate the permissions it is given", () => {
    const frozen = freezeFields(basePermissions, ["userUpdateEmail"])

    expect(basePermissions.userUpdateEmail).toBe(accessRules.changeContactsAccount)
    expect(frozen.userUpdateEmail).not.toBe(accessRules.changeContactsAccount)
    expect(frozen.accountUpdateLevel).toBe(accessRules.changeLevelAccount)
  })
})
