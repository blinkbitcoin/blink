# CI environment notes

E2E runs on the Blink `blink-ci` self-hosted runner group via
`nix develop -c ./bats/ci_run.sh` in `.github/workflows/e2e-test.yml`.
