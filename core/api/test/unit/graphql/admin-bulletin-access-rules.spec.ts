import {
  graphql,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql"
import { applyMiddleware } from "graphql-middleware"
import { shield } from "graphql-shield"

import { accessRules } from "@/graphql/admin/access-rules"
import BulletinKey from "@/graphql/admin/types/scalar/bulletin-key"

const BulletinInput = new GraphQLInputObjectType({
  name: "BulletinInput",
  fields: {
    bulletinKey: { type: BulletinKey },
    dismissible: { type: new GraphQLNonNull(GraphQLBoolean), defaultValue: true },
  },
})

const schema = applyMiddleware(
  new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      fields: { ok: { type: GraphQLString } },
    }),
    mutation: new GraphQLObjectType({
      name: "Mutation",
      fields: {
        marketingNotificationTrigger: {
          type: GraphQLString,
          args: { input: { type: new GraphQLNonNull(BulletinInput) } },
          resolve: () => "sent",
        },
        notificationBulletinClose: { type: GraphQLString, resolve: () => "closed" },
      },
    }),
  }),
  shield(
    {
      Mutation: {
        marketingNotificationTrigger: accessRules.triggerMarketingNotification,
        notificationBulletinClose: accessRules.manageBulletins,
      },
    },
    { allowExternalErrors: true },
  ),
)

const contextWithScope = (scope: string[]) => ({
  privilegedClientId: "admin@example.com",
  scope,
})
const marketingContext = contextWithScope(["SEND_NOTIFICATIONS"])
const bulletinManagerContext = contextWithScope([
  "SEND_NOTIFICATIONS",
  "MANAGE_BULLETINS",
])

const trigger = (input: string, contextValue: ReturnType<typeof contextWithScope>) =>
  graphql({
    schema,
    source: `mutation { marketingNotificationTrigger(input: ${input}) }`,
    contextValue,
  })

describe("bulletin access rules", () => {
  it("allows a marketing send without bulletin options", async () => {
    const result = await trigger("{}", marketingContext)
    expect(result.data?.marketingNotificationTrigger).toEqual("sent")
  })

  it("allows a marketing send with a non system key", async () => {
    const result = await trigger('{ bulletinKey: "feature-rollout" }', marketingContext)
    expect(result.data?.marketingNotificationTrigger).toEqual("sent")
  })

  it("fails to send a marketing bulletin - system key", async () => {
    const result = await trigger('{ bulletinKey: "system-flow" }', marketingContext)
    expect(result.errors?.[0].message).toEqual("Not Authorised!")
  })

  it("fails to send a marketing bulletin - non dismissible", async () => {
    const result = await trigger("{ dismissible: false }", marketingContext)
    expect(result.errors?.[0].message).toEqual("Not Authorised!")
  })

  it("lets an invalid key reach the resolver for its validation error", async () => {
    const result = await trigger('{ bulletinKey: "invalid key!" }', marketingContext)
    expect(result.data?.marketingNotificationTrigger).toEqual("sent")
  })

  it("fails to send a marketing bulletin - system key with underscore", async () => {
    const result = await trigger('{ bulletinKey: "system_flow" }', marketingContext)
    expect(result.errors?.[0].message).toEqual("Not Authorised!")
  })

  it("normalizes the key before checking the system prefix", async () => {
    const result = await trigger('{ bulletinKey: " SYSTEM-flow " }', marketingContext)
    expect(result.errors?.[0].message).toEqual("Not Authorised!")
  })

  it("allows a system key and non dismissible bulletin with bulletin management", async () => {
    const result = await trigger(
      '{ bulletinKey: "system-flow", dismissible: false }',
      bulletinManagerContext,
    )
    expect(result.data?.marketingNotificationTrigger).toEqual("sent")
  })

  it("fails to send - bulletin management without send notifications", async () => {
    const result = await trigger("{}", contextWithScope(["MANAGE_BULLETINS"]))
    expect(result.errors?.[0].message).toEqual("Not Authorised!")
  })

  it("fails to close a bulletin - missing bulletin management", async () => {
    const result = await graphql({
      schema,
      source: "mutation { notificationBulletinClose }",
      contextValue: marketingContext,
    })
    expect(result.errors?.[0].message).toEqual("Not Authorised!")
  })

  it("allows closing a bulletin with bulletin management", async () => {
    const result = await graphql({
      schema,
      source: "mutation { notificationBulletinClose }",
      contextValue: bulletinManagerContext,
    })
    expect(result.data?.notificationBulletinClose).toEqual("closed")
  })
})
