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
    // TODO: store the request and determine what to do if things fail here...

    const res = await registerCaptchaGeetest()

    if (res instanceof Error) {
      return {
        errors: [mapAndParseErrorForGqlResponse(res)],
      }
    }

    const { gt, challenge, newCaptcha } = res

    return {
      errors: [],
      result: {
        id: gt,
        challengeCode: challenge,
        newCaptcha,
        // register() fails closed while geetest is degraded rather than minting
        // an offline challenge, so failback mode is never advertised.
        failbackMode: false,
      },
    }
  },
})

export default CaptchaCreateChallengeMutation
