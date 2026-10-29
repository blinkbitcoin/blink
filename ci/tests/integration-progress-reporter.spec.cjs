// Run from the repository root: node --test ci/tests/integration-progress-reporter.spec.cjs
const assert = require("node:assert/strict")
const fs = require("node:fs")
const { createRequire } = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const root = path.resolve(__dirname, "../..")
const api = path.join(root, "core/api")
const apiRequire = createRequire(path.join(api, "package.json"))
const ProgressReporter = apiRequire("./test/integration/progress-reporter.js")
const integrationConfig = apiRequire("./test/integration/jest.config.js")

const specPath = path.join(api, "test/integration/app/example.spec.ts")
const stamp = /^\[progress \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] /

// Runs fn with process.stdout.write captured, returning the lines written.
const captureStdout = (fn) => {
  const lines = []
  const write = process.stdout.write
  process.stdout.write = (chunk) => {
    lines.push(...String(chunk).split("\n").filter(Boolean))
    return true
  }
  try {
    fn()
  } finally {
    process.stdout.write = write
  }
  return lines
}

const withoutStamp = (lines) =>
  lines.map((line) => {
    assert.match(line, stamp, "every line starts with a timestamp")
    return line.replace(stamp, "")
  })

test("reports file and test starts and results, relative to core/api", () => {
  const reporter = new ProgressReporter()
  const lines = captureStdout(() => {
    reporter.onTestFileStart({ path: specPath })
    reporter.onTestCaseStart({ path: specPath }, { fullName: "Suite does a thing" })
    reporter.onTestCaseResult(
      { path: specPath },
      { status: "passed", duration: 12, fullName: "Suite does a thing" },
    )
    reporter.onTestFileResult(
      { path: specPath },
      { numPassingTests: 1, numFailingTests: 0, testExecError: undefined },
    )
  })

  assert.deepEqual(withoutStamp(lines), [
    "file start test/integration/app/example.spec.ts",
    "  test start Suite does a thing",
    "  test passed (12 ms) Suite does a thing",
    "file end test/integration/app/example.spec.ts (1 passed, 0 failed)",
  ])
})

test("reports a missing duration and a file-level error", () => {
  const reporter = new ProgressReporter()
  const lines = captureStdout(() => {
    reporter.onTestCaseResult(
      { path: specPath },
      { status: "failed", duration: undefined, fullName: "Suite times out" },
    )
    reporter.onTestFileResult(
      { path: specPath },
      {
        numPassingTests: 0,
        numFailingTests: 1,
        testExecError: { message: "Cannot find module 'x'" },
      },
    )
  })

  assert.deepEqual(withoutStamp(lines), [
    "  test failed (? ms) Suite times out",
    "file end test/integration/app/example.spec.ts (0 passed, 1 failed, error: Cannot find module 'x')",
  ])
})

test("integration config resolves the reporter without <rootDir>", () => {
  const reporter = integrationConfig.reporters.find((entry) => entry !== "default")
  assert.ok(reporter, "the progress reporter is registered")
  assert.ok(
    path.isAbsolute(reporter) && !reporter.includes("<rootDir>"),
    "a config reused with another rootDir must still find the reporter",
  )
  assert.ok(fs.existsSync(reporter), `${reporter} exists`)
  assert.ok(
    integrationConfig.reporters.includes("default"),
    "Jest's default output is kept",
  )
})
