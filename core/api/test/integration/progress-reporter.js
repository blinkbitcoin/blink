// Prints each test file and test as it starts and finishes, with the time.
//
// When buck2 kills this suite on its timeout, it keeps what the run wrote to
// stdout but not Jest's results, so a hung run otherwise doesn't say where it
// hung. The last "start" line without a matching "end" is the one that hung.
const path = require("path")

const rootDir = path.resolve(__dirname, "../..")
const rel = (testPath) => path.relative(rootDir, testPath)
const now = () => new Date().toISOString()
const log = (line) => process.stdout.write(`[progress ${now()}] ${line}\n`)

class ProgressReporter {
  onTestFileStart(test) {
    log(`file start ${rel(test.path)}`)
  }

  onTestCaseStart(test, testCaseStartInfo) {
    log(`  test start ${testCaseStartInfo.fullName}`)
  }

  onTestCaseResult(test, testCaseResult) {
    log(
      `  test ${testCaseResult.status} (${testCaseResult.duration ?? "?"} ms) ${testCaseResult.fullName}`,
    )
  }

  onTestFileResult(test, testResult) {
    const { numPassingTests, numFailingTests, testExecError } = testResult
    const error = testExecError ? `, error: ${testExecError.message}` : ""
    log(
      `file end ${rel(test.path)} (${numPassingTests} passed, ${numFailingTests} failed${error})`,
    )
  }
}

module.exports = ProgressReporter
