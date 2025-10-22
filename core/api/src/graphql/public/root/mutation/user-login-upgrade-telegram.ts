import { Authentication } from "@/app"

import { GT } from "@/graphql/index"
import { IpMissingInContextError } from "@/graphql/error"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import UpgradePayload from "@/graphql/public/types/payload/upgrade-payload"
import Phone from "@/graphql/shared/types/scalar/phone"
import TelegramPassportNonce from "@/graphql/shared/types/scalar/telegram-passport-nonce"

import { ErrorLevel } from "@/domain/shared"
import { baseLogger } from "@/services/logger"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const UserLoginUpgradeTelegramInput = GT.Input({
  name: "UserLoginUpgradeTelegramInput",
  fields: () => ({
    phone: { type: GT.NonNull(Phone) },
    nonce: { type: GT.NonNull(TelegramPassportNonce) },
  }),
})

const UserLoginUpgradeTelegramMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  {
    input: {
      phone: PhoneNumber | InputValidationError
      nonce: TelegramPassportNonce | InputValidationError
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(UpgradePayload),
  args: {
    input: { type: GT.NonNull(UserLoginUpgradeTelegramInput) },
  },
  resolve: async (_, args, { ip, domainAccount }) => {
    const { phone, nonce } = args.input

    if (phone instanceof Error) {
      return { errors: [{ message: phone.message }], success: false }
    }

    if (nonce instanceof Error) {
      return { errors: [{ message: nonce.message }], success: false }
    }

    if (ip === undefined) {
      const error = new IpMissingInContextError({ logger: baseLogger })
      recordExceptionInCurrentSpan({
        error,
        level: ErrorLevel.Critical,
      })
      return {
        errors: [error],
        success: false,
      }
    }

    const res = await Authentication.loginDeviceUpgradeWithTelegramPassportNonce({
      phone,
      nonce,
      ip,
      account: domainAccount,
    })

    if (res instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(res)], success: false }
    }

    return { errors: [], success: res.success, authToken: res.authToken }
  },
})

export default UserLoginUpgradeTelegramMutation
