import { ApolloServer } from "@apollo/server"
import { startServerAndCreateNextHandler } from "@as-integrations/next"

import { NextRequest } from "next/server"

import resolvers from "../../../graphql/resolvers"
import typeDefs from "../../../graphql/schema"

const server = new ApolloServer({
  typeDefs,
  resolvers,
  formatError: (err) => {
    return {
      message: err.message,
      locations: err.locations,
      code: err.extensions?.code,
    }
  },
})

const handler = startServerAndCreateNextHandler<NextRequest>(server)

// Next 15 rejects the handler's (req, res?) signature as a route export, so wrap it
export async function GET(request: NextRequest) {
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}
