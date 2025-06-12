import { registerCaptchaGeetest } from "@/app/captcha"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { GT } from "@/graphql/index"
import CaptchaCreateChallengePayload from "@/graphql/public/types/payload/captcha-create-challenge"

const CaptchaCreateChallengeMutation = GT.Field({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(CaptchaCreateChallengePayload),
  resolve: async () => {
    const res = await registerCaptchaGeetest()

    if (res instanceof Error) {
      return {
        errors: [mapAndParseErrorForGqlResponse(res)],
      }
    }

    const { success, gt, challenge, newCaptcha, version } = res

    return {
      errors: [],
      result: {
        id: gt,
        challengeCode: challenge,
        newCaptcha,
        failbackMode: success === 0,
        // Include version info for frontend detection
        ...(version && { version }),
      },
    }
  },
})

export default CaptchaCreateChallengeMutation
