const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")
const { test } = require("node:test")
const vm = require("node:vm")

const filename = path.join(__dirname, "lnurl-transport.cjs")
const source = fs.readFileSync(filename, "utf8")
const fixture = "lnurl-fixture.example"

const load = (env = { NETWORK: "regtest", BATS_LNURL_FIXTURE: "1" }, httpRequest) => {
  const calls = []
  const dns = { lookup: async (...args) => { calls.push(["dns", ...args]); return "dns-result" } }
  const https = { request: (...args) => { calls.push(["https", ...args]); return "https-result" } }
  const localHttp = { request: httpRequest || ((...args) => { calls.push(["http", ...args]); return "http-result" }) }
  vm.runInNewContext(source, {
    process: { env },
    require: (name) => ({ "node:dns/promises": dns, "node:https": https, "node:http": localHttp })[name],
  }, { filename })
  return { dns, https, calls }
}

test("refuses activation outside explicitly enabled regtest Bats", () => {
  assert.throws(() => load({ NETWORK: "mainnet", BATS_LNURL_FIXTURE: "1" }), /restricted/)
  assert.throws(() => load({ NETWORK: "regtest" }), /restricted/)
})

test("only the reserved fixture name gets a synthetic public DNS result", async () => {
  const { dns, calls } = load()
  const address = { address: "93.184.216.34", family: 4 }
  assert.deepEqual(JSON.parse(JSON.stringify(await dns.lookup(fixture, { all: true }))), [address])
  assert.deepEqual(JSON.parse(JSON.stringify(await dns.lookup(fixture))), address)
  assert.equal(await dns.lookup("localhost", { all: true }), "dns-result")
  assert.deepEqual(calls, [["dns", "localhost", { all: true }]])
})

test("ordinary HTTPS requests use the unmodified transport", () => {
  const { https, calls } = load()
  const options = { hostname: "service.example", path: "/pay" }
  const callback = () => {}
  assert.equal(https.request(options, callback), "https-result")
  assert.deepEqual(calls, [["https", options, callback]])
})

test("fixture request preserves the callback, path, limits and abort signal", () => {
  const { https, calls } = load()
  const callback = () => {}
  const signal = new AbortController().signal
  const options = { hostname: fixture, port: 443, path: "/pay?amount=2000", method: "GET", agent: false, signal, timeout: 5000, lookup: () => {}, headers: { Accept: "application/json" } }
  assert.equal(https.request(options, callback), "http-result")
  const [, forwarded, actualCallback] = calls[0]
  assert.equal(actualCallback, callback)
  assert.equal(forwarded.hostname, "127.0.0.1")
  assert.equal(forwarded.port, 3002)
  assert.equal(forwarded.protocol, "http:")
  assert.equal(forwarded.lookup, undefined)
  for (const key of ["path", "method", "agent", "signal", "timeout"]) assert.equal(forwarded[key], options[key])
  assert.deepEqual(JSON.parse(JSON.stringify(forwarded.headers)), { Accept: "application/json", host: fixture, "x-forwarded-host": fixture, "x-forwarded-proto": "https", "x-forwarded-port": "443" })
  assert.equal(options.hostname, fixture)
  assert.equal(options.port, 443)
})

test("local Pay sees the public HTTPS origin for its invoice callback", async () => {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json")
    res.end(JSON.stringify({ callback: `${req.headers["x-forwarded-proto"]}://${req.headers["x-forwarded-host"]}/lnurlp/alice/callback` }))
  })
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  try {
    const { https } = load(undefined, (options, callback) => http.request({ ...options, port: server.address().port }, callback))
    const body = await new Promise((resolve, reject) => {
      const req = https.request({ hostname: fixture, path: "/.well-known/lnurlp/alice", agent: false }, (res) => {
        let data = ""
        res.on("data", chunk => { data += chunk })
        res.on("end", () => resolve(JSON.parse(data)))
        res.on("error", reject)
      })
      req.on("error", reject)
      req.end()
    })
    assert.equal(body.callback, `https://${fixture}/lnurlp/alice/callback`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})
