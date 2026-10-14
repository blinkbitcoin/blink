// Run from the repository root: node --test ci/tests/integration-worker-recycling.spec.cjs
const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const { createRequire } = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const root = path.resolve(__dirname, "../..")
const api = path.join(root, "core/api")
const apiRequire = createRequire(path.join(api, "package.json"))
const integrationConfig = apiRequire("./test/integration/jest.config.js")
const configPath = "test/integration/jest.config.js"
const memoryLimit = 512 * 1000 * 1000 // Jest interprets MB as decimal bytes.

// These source assertions guard the two entry points without booting the stack.
test("pnpm integration entry point uses the recycling config, not runInBand", () => {
  const script = apiRequire("./package.json").scripts["test:integration"]
  assert.match(script, /jest\s+--config\s+\.\/test\/integration\/jest\.config\.js\b/)
  assert.doesNotMatch(script, /--runInBand\b|(?:^|\s)-i(?:\s|$)|--run-in-band\b/)
  assert.doesNotMatch(script, /--maxWorkers\b|--max-workers\b|--workerIdleMemoryLimit\b/)
})

test("Buck integration target uses the recycling config, not run_serially", () => {
  const buck = fs.readFileSync(path.join(api, "BUCK"), "utf8")
  const targets = buck.match(/jest_test\([\s\S]*?^\)/gm) || []
  const integration = targets.filter((target) =>
    /name\s*=\s*"test-integration"/.test(target),
  )
  assert.equal(integration.length, 1, "expected exactly one integration Jest target")
  assert.match(integration[0], /config_file\s*=\s*"test\/integration\/jest.config.js"/)
  assert.doesNotMatch(integration[0], /run_serially\s*=\s*True|--runInBand/)
})

test("integration suites reuse one worker, recycle above 512MB, and never overlap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blink-jest-recycling-"))
  try {
    const eventsPath = path.join(dir, "events.jsonl")
    const lockPath = path.join(dir, "active-suite")
    const sequencerPath = path.join(dir, "sequencer.cjs")
    fs.writeFileSync(
      sequencerPath,
      `const Sequencer = require(${JSON.stringify(apiRequire.resolve("@jest/test-sequencer"))}).default
module.exports = class extends Sequencer {
  sort(tests) { return tests.sort((a, b) => a.path.localeCompare(b.path)) }
}
`,
    )

    // Only replace application discovery/setup/transforms. Scheduling and the memory
    // limit come unchanged from the real integration config, not a test-only copy.
    const config = {
      ...integrationConfig,
      rootDir: dir,
      roots: [dir],
      testRegex: "[0-9]+\\.spec\\.js$",
      setupFilesAfterEnv: [],
      transform: {},
      moduleNameMapper: {},
      testSequencer: sequencerPath,
      cacheDirectory: path.join(dir, "cache"),
    }
    const fixtureConfig = path.join(dir, "jest.config.json")
    fs.writeFileSync(fixtureConfig, JSON.stringify(config))

    for (let suite = 0; suite < 5; suite++) {
      fs.writeFileSync(
        path.join(dir, `${suite}.spec.js`),
        `const fs = require("node:fs")
const vm = require("node:vm")
const eventsPath = ${JSON.stringify(eventsPath)}
const lockPath = ${JSON.stringify(lockPath)}
const suite = ${suite}
let ownsLock = false
const record = (phase) => fs.appendFileSync(eventsPath, JSON.stringify({
  suite, phase, pid: process.pid, heap: process.memoryUsage().heapUsed,
  time: process.hrtime.bigint().toString(),
}) + "\\n")

beforeAll(() => {
  // Atomic acquisition also detects overlapping suites on different workers.
  fs.mkdirSync(lockPath)
  ownsLock = true
  record("start")
})
afterAll(() => {
  if (!ownsLock) return
  record("end")
  fs.rmdirSync(lockPath)
})
test("isolated worker heap probe", async () => {
  if (suite === 2) {
    // Retain real V8 heap outside the Jest sandbox so teardown/GC cannot hide it.
    // Buffers would measure external memory, not the heap Jest checks for recycling.
    const host = vm.runInThisContext("globalThis")
    host.blinkRecyclingProbe = []
    for (let chunk = 0; chunk < 72; chunk++) {
      host.blinkRecyclingProbe.push(new Array(1024 * 1024).fill(chunk))
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 50))
})
`,
      )
    }

    const jestBin = apiRequire.resolve("jest/bin/jest")
    const result = spawnSync(
      process.execPath,
      [jestBin, "--config", fixtureConfig, "--ci", "--no-cache"],
      {
        cwd: api,
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    )
    assert.ifError(result.error)
    assert.equal(result.status, 0, `Jest failed:\n${result.stdout}\n${result.stderr}`)
    const events = fs.readFileSync(eventsPath, "utf8").trim().split("\n").map(JSON.parse)
    assert.equal(events.length, 10, "all five suites must start and finish")

    const completed = []
    for (let suite = 0; suite < 5; suite++) {
      const start = events[suite * 2]
      const end = events[suite * 2 + 1]
      assert.equal(start.suite, suite, "sequencer must run fixtures in order")
      assert.equal(end.suite, suite, "no other suite may start before this one ends")
      assert.equal(start.phase, "start")
      assert.equal(end.phase, "end")
      assert.equal(start.pid, end.pid, "a worker must not restart during a suite")
      assert.notEqual(end.pid, result.pid, "suites must run in a worker, not in-band")
      assert(BigInt(end.time) > BigInt(start.time))
      if (suite > 0) {
        assert(BigInt(start.time) > BigInt(completed[suite - 1].time), "suites overlap")
      }
      assert(
        suite === 2 ? end.heap > memoryLimit : end.heap < memoryLimit,
        `suite ${suite} must be ${suite === 2 ? "above" : "below"} the idle heap limit`,
      )
      completed.push(end)
    }
    assert.equal(completed[0].pid, completed[1].pid, "reuse below the limit")
    assert.equal(completed[1].pid, completed[2].pid, "reuse until crossing the limit")
    assert.notEqual(completed[2].pid, completed[3].pid, "replace above the limit")
    assert.equal(completed[3].pid, completed[4].pid, "reuse the replacement worker")
    assert.equal(integrationConfig.maxWorkers, 1)
    assert.equal(integrationConfig.workerIdleMemoryLimit, "512MB")
    console.log(
      JSON.stringify({
        node: process.version,
        jest: apiRequire("jest/package.json").version,
        config: configPath,
        runnerPid: result.pid,
        suites: completed.map(({ suite, pid, heap }) => ({ suite, pid, heap })),
      }),
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
