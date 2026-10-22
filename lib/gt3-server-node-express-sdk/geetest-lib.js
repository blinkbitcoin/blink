const stringRandom = require('string-random');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const GeetestLibResult = require("./geetest-lib-result");

class GeetestLib {
    static IS_DEBUG = process.env.NODE_ENV !== "production"; // 调试开关，是否输出调试日志
    static API_URL = "http://api.geetest.com";
    static REGISTER_URL = "/register.php";
    static VALIDATE_URL = "/validate.php";
    static JSON_FORMAT = "1";
    static NEW_CAPTCHA = true;
    static HTTP_TIMEOUT_DEFAULT = 5000; // 单位：毫秒
    static VERSION = "node-express:3.1.1";
    static GEETEST_CHALLENGE = "geetest_challenge"; // 极验二次验证表单传参字段 chllenge
    static GEETEST_VALIDATE = "geetest_validate"; // 极验二次验证表单传参字段 validate
    static GEETEST_SECCODE = "geetest_seccode"; // 极验二次验证表单传参字段 seccode
    static GEETEST_SERVER_STATUS_SESSION_KEY = "gt_server_status"; // 极验验证API服务状态Session Key
    // Patched (blink): libResult.msg sentinel marking a validate.php transport
    // failure, so callers can distinguish a provider outage from a genuine
    // seccode rejection (both fail closed with status 0).
    static VALIDATE_REQUEST_FAILED_MSG = "validate.php request failed (transport error)";

    constructor(geetest_id, geetest_key) {
        this.geetest_id = geetest_id;
        this.geetest_key = geetest_key;
        this.libResult = new GeetestLibResult();
    }

    gtlog(message) {
        if (GeetestLib.IS_DEBUG) {
            console.log("gtlog: " + message);
        }
    }

    /**
     * 验证初始化
     */
    async register(digestmod, params) {
        this.gtlog(`register(): 开始验证初始化, digestmod=${digestmod}.`);
        const origin_challenge = await this.requestRegister(params);
        this.buildRegisterResult(origin_challenge, digestmod)
        this.gtlog(`register(): 验证初始化, lib包返回信息=${this.libResult}.`);
        return this.libResult
    }

    /**
     * 向极验发送验证初始化的请求，GET方式
     */
    async requestRegister(params) {
        params = Object.assign(params, {
            "gt": this.geetest_id,
            "json_format": GeetestLib.JSON_FORMAT,
            "sdk": GeetestLib.VERSION
        });
        const register_url = GeetestLib.API_URL + GeetestLib.REGISTER_URL;
        this.gtlog(`requestRegister(): 验证初始化, 向极验发送请求, url=${register_url}, params=${JSON.stringify(params)}.`);
        let origin_challenge;
        try {
            const res = await axios({
                url: register_url,
                method: "GET",
                timeout: GeetestLib.HTTP_TIMEOUT_DEFAULT,
                params: params
            });
            const resBody = (res.status === 200) ? res.data : "";
            this.gtlog(`requestRegister(): 验证初始化, 与极验网络交互正常, 返回码=${res.status}, 返回body=${JSON.stringify(resBody)}.`);
            origin_challenge = resBody["challenge"];
        } catch (e) {
            this.gtlog("requestRegister(): 验证初始化, 请求异常，后续流程走宕机模式, " + e.message);
            origin_challenge = "";
        }
        return origin_challenge;
    }
    async localRegister(){
        this.gtlog("获取当前缓存中bypass状态为fail，后续流程走宕机模式 ");
        this.buildRegisterResult("", "")
        this.gtlog(`register(): 验证初始化, lib包返回信息=${this.libResult}.`);
        return this.libResult
    }
    /**
     * 构建验证初始化返回数据
     */
    buildRegisterResult(origin_challenge, digestmod) {
        // origin_challenge为空或者值为0代表失败
        if (!origin_challenge || origin_challenge === "0") {
            // 本地随机生成32位字符串
            const challenge = stringRandom(32).toLowerCase();
            const data = {
                "success": 0,
                "gt": this.geetest_id,
                "challenge": challenge,
                "new_captcha": GeetestLib.NEW_CAPTCHA
            };
            this.libResult.setAll(0, JSON.stringify(data), "获取当前缓存中bypass状态为fail，本地生成challenge，后续流程走宕机模式")
        } else {
            let challenge;
            if (digestmod === "md5") {
                challenge = this.md5_encode(origin_challenge + this.geetest_key);
            } else if (digestmod === "sha256") {
                challenge = this.sha256_encode(origin_challenge + this.geetest_key);
            } else if (digestmod === "hmac-sha256") {
                challenge = this.hmac_sha256_encode(origin_challenge, this.geetest_key);
            } else {
                challenge = this.md5_encode(origin_challenge + this.geetest_key);
            }
            const data = {
                "success": 1,
                "gt": this.geetest_id,
                "challenge": challenge,
                "new_captcha": GeetestLib.NEW_CAPTCHA
            };
            this.libResult.setAll(1, JSON.stringify(data), "");
        }
    }

    /**
     * 正常流程下（即验证初始化成功），二次验证
     */
    async successValidate(challenge, validate, seccode, params) {
        this.gtlog(`successValidate(): 开始二次验证 正常模式, challenge=${challenge}, validate=${validate}, seccode=${validate}.`);
        if (!this.checkParam(challenge, validate, seccode)) {
            this.libResult.setAll(0, "", "正常模式，本地校验，参数challenge、validate、seccode不可为空");
        } else {
            const response_seccode = await this.requestValidate(challenge, validate, seccode, params);
            if (response_seccode === GeetestLib.VALIDATE_REQUEST_FAILED_MSG) {
                // Patched (blink): transport failure reaching validate.php —
                // distinct msg from a genuine rejection below, still status 0.
                this.libResult.setAll(0, "", GeetestLib.VALIDATE_REQUEST_FAILED_MSG);
            } else if (!response_seccode) {
                this.libResult.setAll(0, "", "请求极验validate接口失败");
            } else if (response_seccode === "false") {
                this.libResult.setAll(0, "", "极验二次验证不通过");
            } else {
                this.libResult.setAll(1, "", "");
            }
        }
        this.gtlog(`successValidate(): 二次验证 正常模式, lib包返回信息=${this.libResult}.`);
        return this.libResult;
    }

    /**
     * 异常流程下（即验证初始化失败，宕机模式），二次验证
     * Patched (blink): fail-closed. The upstream SDK passed any non-empty
     * challenge/validate/seccode in outage mode, which opened the captcha gate
     * whenever bypass.geetest.com was unreachable. Outage mode now always
     * rejects; callers must validate against the geetest API instead.
     *
     * NOTE: as of the fail-closed change in core/api/src/services/geetest.ts,
     * no caller reaches this method — register() refuses to start a flow while
     * geetest is degraded, so validate() always uses successValidate(). This
     * patch is defence in depth against a future caller reintroducing the
     * outage path; it is not exercised in production.
     */
    failValidate(challenge, validate, seccode) {
        this.gtlog(`failValidate(): 开始二次验证 宕机模式, challenge=${challenge}, validate=${validate}, seccode=${seccode}.`);
        this.libResult.setAll(0, "", "宕机模式 fail-closed：本地不再放行二次验证，必须通过极验 API 校验");
        this.gtlog(`failValidate(): 二次验证 宕机模式, lib包返回信息=${this.libResult}.`);
        return this.libResult;
    }

    /**
     * 向极验发送二次验证的请求，POST方式
     */
    async requestValidate(challenge, validate, seccode, params) {
        params = Object.assign(params, {
            "seccode": seccode,
            "json_format": GeetestLib.JSON_FORMAT,
            "challenge": challenge,
            "sdk": GeetestLib.VERSION,
            "captchaid": this.geetest_id
        });
        const validate_url = GeetestLib.API_URL + GeetestLib.VALIDATE_URL;
        this.gtlog(`requestValidate(): 二次验证 正常模式, 向极验发送请求, url=${validate_url}, params=${JSON.stringify(params)}.`);
        let response_seccode;
        try {
            const res = await axios({
                url: validate_url,
                method: "POST",
                timeout: GeetestLib.HTTP_TIMEOUT_DEFAULT,
                data: qs.stringify(params),
                headers: {"Content-Type": "application/x-www-form-urlencoded"}
            });
            if (res.status !== 200) {
                // Patched (blink): a non-200 from validate.php is a provider-side
                // failure, not a user rejection — report it like a transport error.
                this.gtlog(`requestValidate(): 二次验证 正常模式, 极验返回非200, 返回码=${res.status}.`);
                return GeetestLib.VALIDATE_REQUEST_FAILED_MSG;
            }
            const resBody = res.data;
            this.gtlog(`requestValidate(): 二次验证 正常模式, 与极验网络交互正常, 返回码=${res.status}, 返回body=${JSON.stringify(resBody)}.`);
            response_seccode = resBody["seccode"];
        } catch (e) {
            this.gtlog("requestValidate(): 二次验证 正常模式, 请求异常, " + e.message);
            // Patched (blink): was "", which successValidate could not tell apart
            // from a genuine rejection.
            response_seccode = GeetestLib.VALIDATE_REQUEST_FAILED_MSG;
        }
        return response_seccode;
    }

    /**
     * 校验二次验证的三个参数，校验通过返回true，校验失败返回false
     */
    checkParam(challenge, validate, seccode) {
        return !(challenge == undefined || challenge.trim() === "" || validate == undefined || validate.trim() === "" || seccode == undefined || seccode.trim() === "");
    }

    /**
     * md5 加密
     */
    md5_encode(value) {
        return crypto.createHash("md5").update(value).digest("hex");
    }

    /**
     * sha256加密
     */
    sha256_encode(value) {
        return crypto.createHash("sha256").update(value).digest("hex");
    }

    /**
     * hmac-sha256 加密
     */
    hmac_sha256_encode(value, key) {
        return crypto.createHmac("sha256", key).update(value).digest("hex");
    }

}

module.exports = { GeetestLib, VALIDATE_REQUEST_FAILED_MSG: GeetestLib.VALIDATE_REQUEST_FAILED_MSG };
