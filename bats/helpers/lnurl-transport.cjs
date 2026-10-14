// Test-only network adapter for the local Pay fixture. Core still validates a
// public HTTPS origin; only this Bats API process maps it to the local server.
// Never import this from application code or include it in a production image.
if (process.env.NETWORK !== "regtest" || process.env.BATS_LNURL_FIXTURE !== "1") {
  throw new Error("LNURL fixture transport is restricted to regtest Bats runs")
}

const dns = require("node:dns/promises")
const https = require("node:https")
const http = require("node:http")

const hostname = "lnurl-fixture.example"
const publicAddress = { address: "93.184.216.34", family: 4 }
const lookup = dns.lookup.bind(dns)
const request = https.request.bind(https)

dns.lookup = async (name, options) => {
  if (name !== hostname) return lookup(name, options)
  return options?.all ? [publicAddress] : publicAddress
}

https.request = (options, ...args) => {
  if (options.hostname !== hostname) return request(options, ...args)
  return http.request({
    ...options,
    hostname: "127.0.0.1",
    port: 3002,
    protocol: "http:",
    lookup: undefined,
    headers: {
      ...options.headers,
      host: hostname,
      "x-forwarded-host": hostname,
      "x-forwarded-proto": "https",
      "x-forwarded-port": "443",
    },
  }, ...args)
}
