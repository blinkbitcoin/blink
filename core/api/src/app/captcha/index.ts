import { getGeetestConfig } from "@/config"
import GeetestService from "@/services/geetest"

export const registerCaptchaGeetest = async () => {
  const geeTestConfig = getGeetestConfig()
  const geetest = GeetestService(geeTestConfig)

  // Simple registration for initial v4 implementation (no IP required)
  const registerResult = await geetest.register()
  if (registerResult instanceof Error) return registerResult

  // Handle both v3 and v4 responses with unified format
  if (geeTestConfig.version === "v4") {
    const { captchaId, challenge } = registerResult as GeetestV4Register

    // Convert v4 response to unified format
    return {
      success: 1,
      gt: captchaId,
      challenge,
      newCaptcha: true,
      version: "v4",
    }
  } else {
    const { success, gt, challenge, newCaptcha } = registerResult as GeetestRegister

    // Add version info to v3 response
    return {
      success,
      gt,
      challenge,
      newCaptcha,
      version: "v3", // Deprecated
    }
  }
}
