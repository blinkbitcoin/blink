LNDS_REST_LOG=".e2e-lnds-rest.log"

bitcoin_cli() {
  docker exec "${COMPOSE_PROJECT_NAME}-bitcoind-1" bitcoin-cli $@
}

lnd_cli() {
  docker exec "${COMPOSE_PROJECT_NAME}-lnd1-1" \
    lncli \
      --macaroonpath /root/.lnd/admin.macaroon \
      --tlscertpath /root/.lnd/tls.cert \
      $@
}

lnd2_cli() {
  docker exec "${COMPOSE_PROJECT_NAME}-lnd2-1" \
    lncli \
      --macaroonpath /root/.lnd/admin.macaroon \
      --tlscertpath /root/.lnd/tls.cert \
      $@
}

lnd_outside_cli() {
  docker exec "${COMPOSE_PROJECT_NAME}-lnd-outside-1-1" \
    lncli \
      --macaroonpath /root/.lnd/admin.macaroon \
      --tlscertpath /root/.lnd/tls.cert \
      $@
}

lnd_outside_rest() {
  local route=$1
  local endpoint="https://localhost:8080/$route"

  local data=$2
  local request_args=()

  if [[ -n $data ]]; then
    request_args=(--post-data "$data")
  fi

  local macaroon_hex=$(
    docker exec "${COMPOSE_PROJECT_NAME}-lnd-outside-1-1" \
      xxd -p -c 10000 /root/.lnd/admin.macaroon
  )

  # The LND image ships wget rather than curl. Preserve response bodies on
  # server errors, but do not let wget retry and stall the test suite.
  docker exec "${COMPOSE_PROJECT_NAME}-lnd-outside-1-1" \
    wget -qO- \
      --tries=1 \
      --content-on-error \
      --ca-certificate /root/.lnd/tls.cert \
      --header "Grpc-Metadata-macaroon: $macaroon_hex" \
      "${request_args[@]}" \
      "$endpoint" \
  > "$LNDS_REST_LOG"
}

lnd_outside_2_cli() {
  docker exec "${COMPOSE_PROJECT_NAME}-lnd-outside-2-1" \
    lncli \
      --macaroonpath /root/.lnd/admin.macaroon \
      --tlscertpath /root/.lnd/tls.cert \
      $@
}

bria_cli() {
 docker exec "${COMPOSE_PROJECT_NAME}-bria-1" bria $@ 
}

tilt_cli() {
  tilt $@
}

mongo_cli() {
  docker exec "${COMPOSE_PROJECT_NAME}-mongodb-1" mongosh --quiet mongodb://localhost:27017/galoy --eval $@
}

redis_cli() {
  docker exec "${COMPOSE_PROJECT_NAME}-redis-1" redis-cli $@
}
