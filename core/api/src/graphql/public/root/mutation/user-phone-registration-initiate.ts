import { GT } from "@/graphql/index"

import { Authentication } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import Phone from "@/graphql/shared/types/scalar/phone"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import { ChannelType } from "@/domain/phone-provider"

import PhoneCodeChannelType from "@/graphql/shared/types/scalar/phone-code-channel-type"

const UserPhoneRegistrationInitiateInput = GT.Input({
  name: "UserPhoneRegistrationInitiateInput",
  fields: () => ({
    phone: { type: GT.NonNull(Phone) },
    channel: { type: PhoneCodeChannelType },
    requireUniquePhone: { type: GT.Boolean, defaultValue: false },
  }),
})

const UserPhoneRegistrationInitiateMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  {
    input: {
      phone: PhoneNumber | InputValidationError
      channel: ChannelType | InputValidationError
      requireUniquePhone?: boolean | InputValidationError
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(UserPhoneRegistrationInitiateInput) },
  },
  resolve: async (_, args, { ip, user }) => {
    const { phone, channel, requireUniquePhone } = args.input

    if (ip === undefined) {
      return { errors: [{ message: "ip is undefined" }] }
    }

    if (phone instanceof Error) {
      return { errors: [{ message: phone.message }] }
    }

    if (requireUniquePhone instanceof Error) {
      return { errors: [{ message: requireUniquePhone.message }] }
    }

    if (channel instanceof Error) return { errors: [{ message: channel.message }] }

    const success = await Authentication.requestPhoneCodeForAuthedUser({
      phone,
      ip,
      channel,
      user,
      requireUniquePhone,
    })

    if (success instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(success)] }
    }

    return { errors: [], success }
  },
})

export default UserPhoneRegistrationInitiateMutation
