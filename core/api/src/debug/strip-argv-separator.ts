// `pnpm run` and buck2's task wrapper forward the "--" separator, so a script invoked as
// `buck2 run //core/api:dev-inactivity-fee-job -- custom.yaml fee --as-of X` is handed
// ["--", "custom.yaml", "fee", …] — and the config loader reads process.argv[2] as its yaml
// path at import time, so it would read "--" and silently fall back to the schema defaults.
//
// This module drops the separator, once, for the whole process. It must therefore be imported
// before "@/config" (directly or through "@/app"), which is why importing it is the first
// thing a runner does. `cliArgv` is the cleaned argv without the node and script paths: the
// only argument list a runner should parse.
process.argv = process.argv.filter((arg) => arg !== "--")

export const cliArgv = process.argv.slice(2)
