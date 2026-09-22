/**
 * On-demand inactivity-fee job runner (blink-wip#1225, Stories 2.1 and 4.1). Same code paths
 * as the monthly cron tasks, without their UTC-1st / UTC-15th gates: `notice` evaluates every
 * dormant account as of a given day and writes one CSV row per account; `fee` evaluates every
 * noticed account and writes one CSV row per wallet (one per account when an account-level
 * check fails). Dry-run by default: nothing is inserted, sent or posted unless --live is passed
 * AND --as-of is today's UTC date; any other date is downgraded to a dry run and reported as
 * forcedDry. A missed 1st or 15th is never re-run live for a past date. With `fee`, the CCO
 * switch (inactivityFee.liveCharging) always wins: --live under a false flag posts nothing and
 * reports every wallet as flag_off.
 *
 * how to run (from core/api; single runner at a time):
 *
 *   pnpm tsx src/debug/inactivity-fee-run-job.ts /var/yaml/custom.yaml notice --as-of YYYY-MM-DD [--out file.csv]     # dry-run
 *   pnpm tsx src/debug/inactivity-fee-run-job.ts /var/yaml/custom.yaml notice --as-of <today> --live [--out file.csv] # live
 *   pnpm tsx src/debug/inactivity-fee-run-job.ts /var/yaml/custom.yaml fee --as-of YYYY-MM-DD [--out file.csv]        # dry-run
 *   pnpm tsx src/debug/inactivity-fee-run-job.ts /var/yaml/custom.yaml fee --as-of <today> --live [--out file.csv]    # live
 *   buck2 run //core/api:dev-inactivity-fee-job -- [custom.yaml] notice|fee --as-of YYYY-MM-DD [--live]              # dev stack
 *
 * config    blink's loader reads process.argv[2] as the custom.yaml path at import time and
 *           otherwise tries /var/yaml/custom.yaml, the prod mount. With `notice`/`fee` in that
 *           position it finds nothing and runs on the schema defaults — so in the debug pod the
 *           mount path is REQUIRED as the first argument for skipAccountIds, level0Deadline,
 *           notPermittedCountries, liveCharging and configVersion to be the deployment's. The
 *           forwarded "--" separator is dropped before the loader runs, so the path works through
 *           buck2 too. The runner refuses to start when a given path is not the one the loader
 *           read, or when the mount exists and was not loaded; the dev stack has no mount and its
 *           config is the defaults. The path in force is echoed at start.
 * asOf      the given day at 00:00:00Z; issuedAt of every notice row written by a live run, and
 *           the month (YYYY-MM) of every fee debit.
 * report    notice: CSV account_id,outcome,reason,notice_id (outcome in noticed|resent|
 *           already_noticed|would_notice|skipped|send_failed|error).
 *           fee: CSV account_id,wallet_id,currency,outcome,reason,amount,external_id,notice_id
 *           (outcome in charged|would_charge|skipped|error; amount in the wallet's unit).
 *           reason = skip reason or error name. Written row by row; the run summary (the
 *           inactivityfeeruns document, with the pinned rate for `fee`) to <out>.summary.json.
 *           Refuses to overwrite an existing --out. Exit code 1 when the run aborted, and also
 *           when any row ended in `error` (a per-wallet failure or an invariant breach never
 *           aborts the run, but it must not read as a clean run either).
 */

import { appendFileSync, existsSync, writeFileSync } from "fs"
import { resolve } from "path"

// MUST be imported before "@/app" and "@/config": it strips the forwarded "--" from
// process.argv, and the config loader reads process.argv[2] as its yaml path at import time.
// Only "fs" and "path" may precede it (neither loads the config). `cliArgv` is that cleaned
// argv, and the only source of arguments this runner parses.
import { cliArgv } from "./strip-argv-separator"

import { InactivityFee } from "@/app"

import { getCustomConfigSource, getInactivityFeeConfig } from "@/config"

import {
  feeRunId,
  formatIsoDate,
  InactivityFeeChargeOutcome,
  noticeRunId,
  resolveOnDemandMode,
} from "@/domain/inactivity-fee"

import { setupMongoConnection } from "@/services/mongodb"

type Job = "notice" | "fee"

type CliArgs = {
  configPath: string | undefined
  job: Job
  asOfDate: string
  asOf: Date
  live: boolean
  out: string
}

const JOBS: Job[] = ["notice", "fee"]

const usage = `usage:
  inactivity-fee-run-job.ts [custom.yaml] notice --as-of YYYY-MM-DD [--out <path>]           # dry-run
  inactivity-fee-run-job.ts [custom.yaml] notice --as-of YYYY-MM-DD --live [--out <path>]    # live, today only
  inactivity-fee-run-job.ts [custom.yaml] fee --as-of YYYY-MM-DD [--out <path>]              # dry-run
  inactivity-fee-run-job.ts [custom.yaml] fee --as-of YYYY-MM-DD --live [--out <path>]       # live, today only`

const CSV_HEADER: Record<Job, string> = {
  notice: ["account_id", "outcome", "reason", "notice_id"].join(","),
  fee: [
    "account_id",
    "wallet_id",
    "currency",
    "outcome",
    "reason",
    "amount",
    "external_id",
    "notice_id",
  ].join(","),
}

const isJob = (value: string | undefined): value is Job =>
  value !== undefined && (JOBS as string[]).includes(value)

const parseIsoDay = (value: string | undefined): Date | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return undefined
  // rejects 2026-02-30 and friends, which Date would silently roll over
  return formatIsoDate({ date }) === value ? date : undefined
}

// argv is `cliArgv`: the "--" separator is already gone (see the import at the top)
export const parseCliArgs = (argv: string[], now: Date): CliArgs | Error => {
  const rest = [...argv]
  let configPath: string | undefined
  if (rest[0] !== undefined && !isJob(rest[0]) && !rest[0].startsWith("-")) {
    configPath = rest.shift()
  }
  const job = rest.shift()
  if (!isJob(job)) return new Error(`the job must be one of ${JOBS.join(", ")}\n${usage}`)

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
    out = `/tmp/inactivity-fee-${job}-${live ? "live" : "dry-run"}-${stamp}.csv`
  }
  if (existsSync(out)) return new Error(`${out} already exists - pass a fresh --out path`)
  return { configPath, job, asOfDate: formatIsoDate({ date: asOf }), asOf, live, out }
}

// the loader chose its file at import time; refuse a run that is not on the config asked for
const checkConfigSource = ({
  source,
  configPath,
}: {
  source: CustomConfigSource
  configPath: string | undefined
}): true | Error => {
  if (
    configPath !== undefined &&
    !(source.loaded && source.path === resolve(configPath))
  ) {
    return new Error(
      `${configPath} was not loaded (the loader read ${source.path}); the config path must ` +
        `be the first argument, with nothing before it`,
    )
  }
  if (!source.loaded && existsSync(source.defaultPath)) {
    return new Error(
      `${source.defaultPath} is mounted but was not loaded; pass it as the first argument`,
    )
  }
  return true
}

const csvCell = (v: string): string =>
  /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

const csvLine = (cells: (string | number | undefined)[]): string =>
  cells.map((cell) => csvCell(cell === undefined ? "" : String(cell))).join(",")

const noticeCsvLine = (record: InactivityFeeNoticeOutcomeRecord): string =>
  csvLine([record.accountId, record.outcome, record.reason, record.noticeId])

const feeCsvLine = (record: InactivityFeeChargeOutcomeRecord): string =>
  csvLine([
    record.accountId,
    record.walletId,
    record.currency,
    record.outcome,
    record.reason,
    record.amount,
    record.externalId,
    record.noticeId,
  ])

export const run = async (args: CliArgs): Promise<true | Error> => {
  const now = new Date()
  const { dryRun, forcedDry } = resolveOnDemandMode({
    live: args.live,
    asOf: args.asOf,
    now,
  })
  const runId =
    args.job === "fee" ? feeRunId({ asOf: args.asOf }) : noticeRunId({ asOf: args.asOf })
  const config = getInactivityFeeConfig()
  const source = getCustomConfigSource()
  const checked = checkConfigSource({ source, configPath: args.configPath })
  if (checked instanceof Error) return checked

  const dryLabel =
    args.job === "fee" ? "DRY-RUN (nothing posted)" : "DRY-RUN (no rows, nothing sent)"
  console.log(
    `inactivity-fee ${args.job} job — ${dryRun ? dryLabel : "LIVE"}` +
      (forcedDry ? ` (--live refused: --as-of ${args.asOfDate} is not today)` : ""),
  )
  const configSource = source.loaded
    ? `${source.path} (loaded)`
    : `${source.path} (not loaded → schema defaults)`
  console.log(
    `config: ${configSource}; ` +
      `configVersion=${config.configVersion} liveCharging=${config.liveCharging} ` +
      `feeAmountUsdCents=${config.feeAmountUsdCents} ` +
      `skipAccountIds=${config.skipAccountIds.length} ` +
      `notPermittedCountries=${config.notPermittedCountries.join(",") || "-"} ` +
      `level0Deadline=${config.level0Deadline.toISOString()}`,
  )
  console.log(`runId: ${runId}; asOf: ${args.asOf.toISOString()}`)

  writeFileSync(args.out, CSV_HEADER[args.job] + "\n")

  let rows = 0
  const append = (line: string) => {
    appendFileSync(args.out, line + "\n")
    rows += 1
    if (rows % 10_000 === 0) console.log(`...processed ${rows} rows`)
  }
  const result =
    args.job === "fee"
      ? await InactivityFee.runFeeJob({
          asOf: args.asOf,
          dryRun,
          forcedDry,
          runId,
          onOutcome: (record) => append(feeCsvLine(record)),
        })
      : await InactivityFee.runNoticeJob({
          asOf: args.asOf,
          dryRun,
          forcedDry,
          runId,
          onOutcome: (record) => append(noticeCsvLine(record)),
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
  if (args.job === "fee") {
    console.log(
      `\nscanned ${result.counts.scanned} noticed account(s) at ${result.rate} USD/BTC ` +
        `(${result.rateSource}); debited ${result.debited?.count ?? 0} wallet(s): ` +
        `${result.debited?.sats ?? 0} sats, ${result.debited?.cents ?? 0} cents`,
    )
  } else {
    console.log(
      `\nscanned ${result.counts.scanned} dormant account(s); ` +
        `${result.counts.accountsWithoutClock} account(s) without an activity clock were never scanned`,
    )
  }
  console.log(`by outcome: ${JSON.stringify(result.counts.byOutcome)}`)
  console.log(`by skip reason: ${JSON.stringify(result.counts.bySkipReason)}`)
  console.log(`report: ${args.out} (summary: ${summaryPath})`)

  // per-account and per-wallet failures never abort the run, and an invariant breach is one of
  // them: an automated caller must not read that as a clean run
  const errors = result.counts.byOutcome[InactivityFeeChargeOutcome.Error] ?? 0
  if (errors > 0) {
    return new Error(
      `${errors} of ${rows} row(s) ended in error - see ${args.out} and the span for ${runId}`,
    )
  }
  return true
}

const main = async () => {
  const args = parseCliArgs(cliArgv, new Date())
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
