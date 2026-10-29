// Based on https://github.com/GeeTeam/gt3-server-node-express-bypass/blob/master/app.js

// https://docs.geetest.com/captcha/apirefer/api/server
// doing this: "If the storage space is not sufficient: Send request to check bypass status before starting the verification process."

import axios from "axios"
import {
  GeetestLib,
  VALIDATE_REQUEST_FAILED_MSG,
} from "@galoy/gt3-server-node-express-sdk"

import { addEventToCurrentSpan, recordExceptionInCurrentSpan } from "./tracing"

import { CacheKeys } from "@/domain/cache"
import {
  CaptchaServiceUnavailableError,
  CaptchaUserFailToPassError,
  UnknownCaptchaError,
} from "@/domain/captcha/errors"
import { LocalCacheService } from "@/services/cache/local-cache"

// bypass.geetest.com is a status endpoint, not part of the verification flow,
// but register() fails closed on it — so without caching every login-screen load
// takes a hard dependency on it and pays its timeout serially. The signal is
// global rather than per-user and changes on the order of minutes, so a short
// cache collapses that to one probe per window per pod while keeping the
// fail-closed behaviour. Failures are cached too: that is the point, it bounds
// the added latency during an outage instead of retrying on every request.
//
// The cache key and the in-flight probe below are process-global, which assumes
// one geetest configuration per process (true of every deployment today). Key
// both by captcha id before supporting more than one.
const BYPASS_STATUS_CACHE_TTL_SECS = 10 as Seconds

// Distinct from a status the endpoint actually reported: a timeout or DNS
// failure reaching a monitoring endpoint is an operational fact about us, not
// evidence that geetest is degraded. Both fail closed; only the span differs.
const BYPASS_UNREACHABLE = "unreachable"

const localCache = LocalCacheService()

// getOrSet only stores the result after the probe settles, so on a cold or
// expired key every concurrent caller would miss and probe on its own — during
// an outage each holding the full timeout. Sharing the pending probe keeps it to
// one outbound request per window no matter how many requests arrive together.
let inFlightBypassProbe: Promise<string> | undefined

const sendRequest = async (params: { gt: string }): Promise<string> => {
  const requestUrl = "https://bypass.geetest.com/v1/bypass_status.php"
  try {
    const res = await axios({
      url: requestUrl,
      method: "GET",
      timeout: 1000,
      params,
    })
    if (res.status !== 200) return BYPASS_UNREACHABLE

    // res.data is `any`; a body without a status field is as uninformative as
    // no response at all, so normalise rather than propagating undefined.
    const status = res.data?.["status"]
    addEventToCurrentSpan("bypassStatusSuccess")
    return typeof status === "string" ? status : BYPASS_UNREACHABLE
  } catch (error) {
    recordExceptionInCurrentSpan({ error, fallbackMsg: "bypassStatusError" })
    return BYPASS_UNREACHABLE
  }
}

const Geetest = (config: { id: string; key: string }): GeetestType => {
  const readBypassStatus = async (): Promise<string> => {
    // getOrSet is generic over the *return type* of getForCaching, so an async
    // producer types as Promise<Promise<string>>; await collapses it.
    const status = await localCache.getOrSet({
      key: CacheKeys.GeetestBypassStatus,
      ttlSecs: BYPASS_STATUS_CACHE_TTL_SECS,
      getForCaching: () => sendRequest({ gt: config.id }),
    })
    return status
  }

  const getBypassStatus = (): Promise<string> => {
    // getOrSet writes the cache before it resolves, so once this clears, later
    // callers inside the window are served from the cache instead.
    if (!inFlightBypassProbe) {
      inFlightBypassProbe = readBypassStatus().finally(() => {
        inFlightBypassProbe = undefined
      })
    }
    return inFlightBypassProbe
  }

  const register = async (): Promise<CaptchaError | GeetestRegister> => {
    try {
      const gtLib = new GeetestLib(config.id, config.key)
      const digestmod = "md5"
      const params = {
        digestmod,
        client_type: "native",
      }
      // Fail closed. The SDK's outage mode (localRegister) mints a challenge
      // geetest has never seen, which validate() can only ever reject — the user
      // would solve an offline captcha and be told they failed it. Refuse to
      // start the flow instead, so the caller can surface "try again later".
      const bypassStatus = await getBypassStatus()
      if (bypassStatus !== "success") {
        addEventToCurrentSpan("geetestBypassDegraded", { bypassStatus })
        return new CaptchaServiceUnavailableError()
      }

      const result = await gtLib.register(digestmod, params)

      const { success, gt, challenge, new_captcha: newCaptcha } = JSON.parse(result.data)
      // The SDK resolves even when register.php failed: buildRegisterResult then
      // reports status 0 with a locally minted challenge (success: 0) that
      // geetest has never seen and validate() can only reject — the same
      // unusable offline challenge the bypass-degraded branch above refuses.
      // Fail closed on either signal.
      if (result.status !== 1 || success !== 1) {
        addEventToCurrentSpan("geetestRegisterOutage")
        return new CaptchaServiceUnavailableError()
      }
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
      // Always validate against the geetest API. There is deliberately no
      // outage fallback: register() refuses to start a flow while geetest is
      // degraded, so any challenge reaching here should be one geetest issued.
      // The bypass-status probe is deliberately NOT consulted here — it has no
      // effect on the outcome, and running it would put its latency on the
      // critical path of every code submission for a span event alone.
      const result = await gtLib.successValidate(challenge, validate, seccode, [])
      if (result.status !== 1) {
        // Fail closed either way, but a validate.php transport failure is a
        // provider outage, not the user failing the captcha — the vendored SDK
        // flags it with a sentinel msg so the two are not conflated.
        if (result.msg === VALIDATE_REQUEST_FAILED_MSG) {
          // The SDK swallows the transport error and production gtlog is off, so
          // without this the outage only shows up as a 503. A span event rather
          // than a recorded exception: it fires per request during an outage.
          addEventToCurrentSpan("geetestValidateOutage")
          return new CaptchaServiceUnavailableError()
        }
        return new CaptchaUserFailToPassError()
      }
      return true
    } catch (err) {
      return new UnknownCaptchaError(err)
    }
  }

  return { register, validate }
}

export default Geetest
