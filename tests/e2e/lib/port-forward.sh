# shellcheck shell=bash
# Manage the kubectl port-forward to the Rounds gateway service.

pf_down() {
  pkill -f "port-forward.*${GATEWAY_RELEASE}" 2>/dev/null || true
  rm -f "${STATE_DIR}/pf.pid" "${STATE_DIR}/url"
}

pf_up() {
  phase "port-forwarding svc/${GATEWAY_RELEASE} -> 127.0.0.1:${GATEWAY_PORT}"
  pf_down
  sleep 1

  kubectl port-forward -n "${GATEWAY_NS}" "svc/${GATEWAY_RELEASE}" \
    "${GATEWAY_PORT}:80" >"${STATE_DIR}/pf.log" 2>&1 &
  local pid=$!
  echo "${pid}" >"${STATE_DIR}/pf.pid"

  local url="http://127.0.0.1:${GATEWAY_PORT}"
  echo "${url}" >"${STATE_DIR}/url"

  local i
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null "${url}/api/health/live"; then
      ok "port-forward live (pid=${pid}, url=${url})"
      return 0
    fi
    sleep 1
  done

  die "port-forward did not become healthy within 60s; see ${STATE_DIR}/pf.log"
}
