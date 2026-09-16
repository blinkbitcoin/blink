/**
 * On-demand inactivity-fee job runner (blink-wip#1225, Story 2.1). Same code path as the
 * monthly cron task, without its UTC-1st gate: `notice` evaluates every dormant account as of
 * a given day and writes one CSV row per account. Dry-run by default: no notice row is
 * inserted and nothing is sent unless --live is passed AND --as-of is today's UTC date; any
 * other date is downgraded to a dry run and reported as forcedDry. A missed 1st is never
 * re-run live for a past date.
 *
 * how to run (from core/api; single runner at a time):
 *
 *   pnpm tsx src/debug/inactivity-fee-run-job.ts [custom.yaml] notice --as-of YYYY-MM-DD [--out file.csv]          # dry-run
 *   pnpm tsx src/debug/inactivity-fee-run-job.ts [custom.yaml] notice --as-of <today> --live [--out file.csv]      # live
 *   buck2 run //core/api:dev-inactivity-fee-job -- notice --as-of YYYY-MM-DD [--live]                             # dev stack
 *
 * config    blink's loader reads process.argv[2] as the custom.yaml path and falls back to
 *           /var/yaml/custom.yaml, the prod mount — so in the debug pod no path is needed for
 *           skipAccountIds, level0Deadline, notPermittedCountries and configVersion to be the
 *           deployment's; pass a path only to point at another file. The resolved path and
 *           whether it was found (absent → schema defaults, i.e. the dev stack) are echoed
 *           at start.
 * asOf      the given day at 00:00:00Z; issuedAt of every row written by a live run.
 * report    CSV account_id,outcome,reason,notice_id (outcome in noticed|resent|
 *           already_noticed|would_notice|skipped|send_failed|error; reason = skip reason or
 *           error name), written row by row; the run summary (the inactivityfeeruns
 *           document) to <out>.summary.json. Refuses to overwrite an existing --out. Exit
 *           code 1 when the run aborted.
 */

import { appendFileSync, existsSync, writeFileSync } from "fs"

import { InactivityFee } from "@/app"

import { getInactivityFeeConfig } from "@/config"

import { formatIsoDate, noticeRunId, resolveOnDemandMode } from "@/domain/inactivity-fee"

import { setupMongoConnection } from "@/services/mongodb"

type CliArgs = {
  configPath: string | undefined
  asOfDate: string
  asOf: Date
  live: boolean
  out: string
}

const usage = `usage:
  inactivity-fee-run-job.ts [custom.yaml] notice --as-of YYYY-MM-DD [--out <path>]           # dry-run
  inactivity-fee-run-job.ts [custom.yaml] notice --as-of YYYY-MM-DD --live [--out <path>]    # live, today only`

const CSV_HEADER = ["account_id", "outcome", "reason", "notice_id"].join(",")

// same fallback as the config loader (config/yaml.ts)
const DEFAULT_CONFIG_PATH = "/var/yaml/custom.yaml"

const parseIsoDay = (value: string | undefined): Date | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return undefined
  // rejects 2026-02-30 and friends, which Date would silently roll over
  return formatIsoDate({ date }) === value ? date : undefined
}

export const parseCliArgs = (argv: string[], now: Date): CliArgs | Error => {
  const rest = [...argv]
  let configPath: string | undefined
  if (rest[0] !== undefined && rest[0] !== "notice" && !rest[0].startsWith("-")) {
    configPath = rest.shift()
  }
  if (rest.shift() !== "notice") return new Error(`the only job is "notice"\n${usage}`)

  let asOf: Date | undefined
  let live = false
  let out = ""
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]
    const value = rest[i + 1]
    switch (flag) {
      case "--as-of": {
        asOf = parseIsoDay(value)
        if (!asOf) return new Error(`--as-of needs a YYYY-MM-DD date\n${usage}`)
        i++
        break
      }
      case "--live": {
        live = true
        break
      }
      case "--out": {
        if (!value || value.startsWith("-")) {
          return new Error(`--out needs a file path\n${usage}`)
        }
        out = value
        i++
        break
      }
      default:
        return new Error(`Unknown argument: ${flag}\n${usage}`)
    }
  }
  if (!asOf) return new Error(`--as-of is required\n${usage}`)
  if (!out) {
    const stamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z")
    out = `/tmp/inactivity-fee-notice-${live ? "live" : "dry-run"}-${stamp}.csv`
  }
  if (existsSync(out)) return new Error(`${out} already exists - pass a fresh --out path`)
  return { configPath, asOfDate: formatIsoDate({ date: asOf }), asOf, live, out }
}

const csvCell = (v: string): string =>
  /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

const csvLine = (record: InactivityFeeNoticeOutcomeRecord): string =>
  [record.accountId, record.outcome, record.reason ?? "", record.noticeId ?? ""]
    .map(csvCell)
    .join(",")

export const run = async (args: CliArgs): Promise<true | Error> => {
  const now = new Date()
  const { dryRun, forcedDry } = resolveOnDemandMode({
    live: args.live,
    asOf: args.asOf,
    now,
  })
  const runId = noticeRunId({ asOf: args.asOf })
  const config = getInactivityFeeConfig()

  console.log(
    `inactivity-fee notice job — ${dryRun ? "DRY-RUN (no rows, nothing sent)" : "LIVE"}` +
      (forcedDry ? ` (--live refused: --as-of ${args.asOfDate} is not today)` : ""),
  )
  const configPath = args.configPath ?? DEFAULT_CONFIG_PATH
  const configSource = existsSync(configPath)
    ? `${configPath} (loaded)`
    : `${configPath} (absent → schema defaults)`
  console.log(
    `config: ${configSource}; ` +
      `configVersion=${config.configVersion} skipAccountIds=${config.skipAccountIds.length} ` +
      `notPermittedCountries=${config.notPermittedCountries.join(",") || "-"} ` +
      `level0Deadline=${config.level0Deadline.toISOString()}`,
  )
  console.log(`runId: ${runId}; asOf: ${args.asOf.toISOString()}`)

  writeFileSync(args.out, CSV_HEADER + "\n")

  let rows = 0
  const result = await InactivityFee.runNoticeJob({
    asOf: args.asOf,
    dryRun,
    forcedDry,
    runId,
    onOutcome: (record) => {
      appendFileSync(args.out, csvLine(record) + "\n")
      rows += 1
      if (rows % 10_000 === 0) console.log(`...processed ${rows} accounts`)
    },
  })

  const summaryPath = `${args.out}.summary.json`
  if (result instanceof Error) {
    writeFileSync(
      summaryPath,
      JSON.stringify(
        { runId, mode: dryRun ? "dry" : "live", forcedDry, rows, error: result.message },
        null,
        2,
      ) + "\n",
    )
    console.log(`report: ${args.out} (summary: ${summaryPath})`)
    return result
  }

  writeFileSync(summaryPath, JSON.stringify({ ...result, configSource }, null, 2) + "\n")
  console.log(
    `\nscanned ${result.counts.scanned} dormant account(s); ` +
      `${result.counts.accountsWithoutClock} account(s) without an activity clock were never scanned`,
  )
  console.log(`by outcome: ${JSON.stringify(result.counts.byOutcome)}`)
  console.log(`by skip reason: ${JSON.stringify(result.counts.bySkipReason)}`)
  console.log(`report: ${args.out} (summary: ${summaryPath})`)
  return true
}

const main = async () => {
  const args = parseCliArgs(process.argv.slice(2), new Date())
  if (args instanceof Error) {
    console.error(args.message)
    process.exitCode = 1
    return
  }
  const result = await run(args)
  if (result instanceof Error) {
    console.error("Error:", result.message)
    process.exitCode = 1
  }
}

// Importing `@/app` opens Redis, LND and pub-sub handles that keep the event loop alive after
// main() returns, so the process exits explicitly (as servers/cron.ts does) instead of hanging.
if (require.main === module) {
  setupMongoConnection()
    .then(async (mongoose) => {
      try {
        await main()
      } catch (err) {
        console.error(err)
        process.exitCode = 1
      } finally {
        if (mongoose) await mongoose.connection.close()
      }
      process.exit(process.exitCode ?? 0)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
