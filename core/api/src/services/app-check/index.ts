import * as admin from "firebase-admin"

import {
  MissingAppCheckTokenError,
  UnauthorizedAppCheckTokenError,
  UnknownAppCheckError,
} from "@/domain/app-check"
import { wrapAsyncFunctionsToRunInSpan } from "@/services/tracing"
import { GOOGLE_APPLICATION_CREDENTIALS } from "@/config"
import { baseLogger } from "@/services/logger"

const logger = baseLogger.child({ module: "app-check" })

let appCheck: admin.appCheck.AppCheck | undefined

if (GOOGLE_APPLICATION_CREDENTIALS) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    })
  }

  appCheck = admin.appCheck()
}

export const AppCheck = (): IAppCheckService => {
  const verifyToken = async ({
    token,
    checkAlreadyConsumed = false,
  }: {
    token: string
    checkAlreadyConsumed?: boolean
  }): Promise<true | AppCheckServiceError> => {
    if (!token) {
      return new MissingAppCheckTokenError()
    }

    if (!appCheck) {
      logger.warn("Firebase AppCheck not initialized")
      return true
    }

    try {
      const result = await appCheck.verifyToken(token)
      if (checkAlreadyConsumed && result.alreadyConsumed) {
        return new UnauthorizedAppCheckTokenError("Already consumed")
      }
      return true
    } catch (err) {
      const error = err as Error
      if (
        error.message.includes("invalid-argument") ||
        error.message.includes("invalid-credential")
      ) {
        return new UnauthorizedAppCheckTokenError(error.message)
      }
      return new UnknownAppCheckError(error.message)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.app-check",
    fns: {
      verifyToken,
    },
  })
}
