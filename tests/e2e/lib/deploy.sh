# shellcheck shell=bash
# Build the openobs image, load it into kind, and helm install.

image_build_and_load() {
  phase "building docker image ${IMAGE}"
  docker build -t "${IMAGE}" "${REPO_ROOT}"
  phase "loading image into kind cluster ${CLUSTER}"
  kind load docker-image "${IMAGE}" --name "${CLUSTER}"
  ok "image ${IMAGE} loaded"
}

helm_install() {
  phase "helm install ${GATEWAY_RELEASE} -> namespace ${GATEWAY_NS}"

  local values_file="${E2E_ROOT}/fixtures/helm/values.test.yaml"
  local -a sets=(
    --set "image.repository=${IMAGE_REPO}"
    --set "image.tag=${IMAGE_TAG}"
    --set "image.pullPolicy=IfNotPresent"
    --set "env.extra.ALERT_EVALUATOR_REFRESH_MS=3600000"
  )

  if [[ -n "${OPENOBS_TEST_LLM_PROVIDER}" ]]; then
    sets+=(--set "env.LLM_PROVIDER=${OPENOBS_TEST_LLM_PROVIDER}")
  fi
  if [[ -n "${OPENOBS_TEST_LLM_MODEL}" ]]; then
    sets+=(--set "env.LLM_MODEL=${OPENOBS_TEST_LLM_MODEL}")
  fi
  if [[ -n "${OPENOBS_TEST_LLM_API_KEY}" ]]; then
    sets+=(--set "secretEnv.LLM_API_KEY=${OPENOBS_TEST_LLM_API_KEY}")
  fi

  helm upgrade --install "${GATEWAY_RELEASE}" "${REPO_ROOT}/helm/openobs" \
    -n "${GATEWAY_NS}" --create-namespace \
    -f "${values_file}" \
    "${sets[@]}"

  ok "helm release ${GATEWAY_RELEASE} applied"
}

wait_ready() {
  phase "waiting for openobs deployment to roll out"
  kubectl rollout status -n "${GATEWAY_NS}" deploy/"${GATEWAY_RELEASE}" --timeout=300s
  ok "openobs is ready"
}
