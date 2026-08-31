#!/usr/bin/env bats

load "../../helpers/cli.bash"

setup() {
  LNDS_REST_LOG="$BATS_TEST_TMPDIR/lnd-rest.log"
  DOCKER_ARGS_LOG="$BATS_TEST_TMPDIR/docker-args.log"
  COMPOSE_PROJECT_NAME="test-project"
}

docker() {
  printf '%s\n' "$*" >> "$DOCKER_ARGS_LOG"

  if [[ "$*" == *" xxd -p "* ]]; then
    printf 'deadbeef\n'
    return 0
  fi

  if [[ "$*" == *" wget "* ]]; then
    printf '%s' "$MOCK_WGET_BODY"
    return "$MOCK_WGET_STATUS"
  fi

  return 1
}

@test "lnd outside REST sends request data with one-shot wget" {
  MOCK_WGET_BODY='{"payment_error":""}'
  MOCK_WGET_STATUS=0

  run lnd_outside_rest "v2/router/send" '{"payment_request":"invoice"}'

  [[ "$status" -eq 0 ]]
  [[ "$(cat "$LNDS_REST_LOG")" == "$MOCK_WGET_BODY" ]]
  grep -F -- "wget -qO- --tries=1 --content-on-error" "$DOCKER_ARGS_LOG"
  grep -F -- "--header Grpc-Metadata-macaroon: deadbeef" "$DOCKER_ARGS_LOG"
  grep -F -- '--post-data {"payment_request":"invoice"}' "$DOCKER_ARGS_LOG"
}

@test "lnd outside REST preserves an HTTP error body and fails without retrying" {
  MOCK_WGET_BODY='{"code":2,"message":"router unavailable"}'
  MOCK_WGET_STATUS=8

  run lnd_outside_rest "v2/router/send" ""

  [[ "$status" -eq 8 ]]
  [[ "$(cat "$LNDS_REST_LOG")" == "$MOCK_WGET_BODY" ]]
  grep -F -- "wget -qO- --tries=1 --content-on-error" "$DOCKER_ARGS_LOG"
  ! grep -F -- "--post-data" "$DOCKER_ARGS_LOG"
}
