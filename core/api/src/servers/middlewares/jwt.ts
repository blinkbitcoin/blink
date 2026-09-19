import { expressjwt } from "express-jwt"
import jsonwebtoken from "jsonwebtoken"

const jwtAlgorithms: jsonwebtoken.Algorithm[] = ["RS256"]

export const JWT_ISSUER = "galoy.io"

export const buildJwtMiddleware = ({
  secret,
  audience,
}: {
  secret: Parameters<typeof expressjwt>[0]["secret"]
  audience?: string
}) =>
  expressjwt({
    secret,
    algorithms: jwtAlgorithms,
    credentialsRequired: true,
    requestProperty: "token",
    issuer: JWT_ISSUER,
    audience,
  })
