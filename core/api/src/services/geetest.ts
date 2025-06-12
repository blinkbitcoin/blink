// Based on https://github.com/GeeTeam/gt3-server-node-express-bypass/blob/master/app.js

// https://docs.geetest.com/captcha/apirefer/api/server
// doing this: "If the storage space is not sufficient: Send request to check bypass status before starting the verification process."

import axios from "axios"
import { GeetestLib } from "@galoy/gt3-server-node-express-sdk"

import { addEventToCurrentSpan, recordExceptionInCurrentSpan } from "./tracing"
import GeetestV4 from "./geetest-v4"

import { CaptchaUserFailToPassError, UnknownCaptchaError } from "@/domain/captcha/errors"

const sendRequest = async (params: { gt: string }) => {
  const requestUrl = "https://bypass.geetest.com/v1/bypass_status.php"
  let bypassRes: string
  try {
    const res = await axios({
      url: requestUrl,
      method: "GET",
      timeout: 1000,
      params,
    })
    const resBody = res.status === 200 ? res.data : ""
    bypassRes = resBody["status"]

    addEventToCurrentSpan("bypassStatusSuccess")
  } catch (error) {
    recordExceptionInCurrentSpan({ error, fallbackMsg: "bypassStatusError" })
    bypassRes = ""
  }
  return bypassRes
}

const GeetestService = (config: { id: string; key: string }): GeetestType => {
  const getBypassStatus = async () => {
    return sendRequest({ gt: config.id })
  }

  const register = async (): Promise<UnknownCaptchaError | GeetestRegister> => {
    try {
      const gtLib = new GeetestLib(config.id, config.key)
      const digestmod = "md5"
      const params = {
        digestmod,
        client_type: "native",
      }
      const bypasscache = await getBypassStatus() // not a cache
      let result
      if (bypasscache === "success") {
        result = await gtLib.register(digestmod, params)
      } else {
        result = await gtLib.localRegister()
      }

      const { success, gt, challenge, new_captcha: newCaptcha } = JSON.parse(result.data)
      const geetestRegister: GeetestRegister = { success, gt, challenge, newCaptcha }
      addEventToCurrentSpan("geetestRegisterSuccess")
      return geetestRegister
    } catch (error) {
      recordExceptionInCurrentSpan({ error, fallbackMsg: "geetestRegisterError" })
      return new UnknownCaptchaError(error)
    }
  }

  const validate = async (
    challenge: string,
    validate: string,
    seccode: string,
  ): Promise<true | CaptchaError> => {
    try {
      const gtLib = new GeetestLib(config.id, config.key)
      const bypasscache = await getBypassStatus() // not a cache
      let result
      if (bypasscache === "success") {
        result = await gtLib.successValidate(challenge, validate, seccode, [])
      } else {
        result = gtLib.failValidate(challenge, validate, seccode)
      }
      if (result.status !== 1) {
        return new CaptchaUserFailToPassError()
      }
      return true
    } catch (err) {
      return new UnknownCaptchaError(err)
    }
  }

  return { register, validate }
}

// Main Geetest service with version detection and deprecation warnings
const Geetest = (config: { id: string; key: string; version: "v3" | "v4" }) => {
  if (config.version === "v4") {
    // Use v4 implementation
    return GeetestV4(config)
  } else {
    // v3 implementation (deprecated)
    console.warn("⚠️  Geetest v3 is deprecated and will be removed in a future version. Please migrate to v4.")
    return Geetest(config)
  }
}

export default GeetestService
