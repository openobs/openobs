# shellcheck shell=bash
# kind cluster lifecycle. Idempotent.

cluster_exists() {
  kind get clusters 2>/dev/null | grep -qx "${CLUSTER}"
}

cluster_up() {
  if cluster_exists; then
    ok "kind cluster ${CLUSTER} already exists"
    return 0
  fi
  phase "creating kind cluster ${CLUSTER}"
  kind create cluster --name "${CLUSTER}" --wait 120s
  ok "kind cluster ${CLUSTER} ready"
}

cluster_down() {
  if ! cluster_exists; then
    ok "kind cluster ${CLUSTER} not present"
    return 0
  fi
  phase "deleting kind cluster ${CLUSTER}"
  kind delete cluster --name "${CLUSTER}"
  ok "kind cluster ${CLUSTER} deleted"
}
