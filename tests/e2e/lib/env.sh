# shellcheck shell=bash
# Shared defaults for the rounds e2e testkit. Source this from any kit script.
# All variables can be overridden by the caller's environment.

: "${CLUSTER:=rounds-e2e}"
: "${NS:=rounds-e2e}"
: "${GATEWAY_NS:=rounds}"
: "${GATEWAY_PORT:=3000}"
: "${GATEWAY_RELEASE:=rounds}"

# IMAGE_TAG defaults to the short git sha; falls back to "test" outside a repo.
if [[ -z "${IMAGE_TAG:-}" ]]; then
  IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || echo test)"
fi
: "${IMAGE_REPO:=ghcr.io/syntropize/rounds}"
: "${IMAGE:=${IMAGE_REPO}:${IMAGE_TAG}}"

# LLM config supplied by the user. Required for kit.sh up to deploy meaningfully,
# but we do not validate here so dry-run / local lint work without secrets.
: "${OPENOBS_TEST_LLM_PROVIDER:=}"
: "${OPENOBS_TEST_LLM_API_KEY:=}"
: "${OPENOBS_TEST_LLM_MODEL:=}"

# Repo + state paths. REPO_ROOT is computed relative to this file's location so
# kit.sh works regardless of the caller's cwd.
ENV_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${ENV_SH_DIR}/../../.." && pwd)"
# ENV_SH_DIR is tests/e2e/lib so three levels up = repo root.
E2E_ROOT="${REPO_ROOT}/tests/e2e"
STATE_DIR="${E2E_ROOT}/.state"

mkdir -p "${STATE_DIR}"

# Color helpers for phase markers. No-op if NO_COLOR is set.
if [[ -z "${NO_COLOR:-}" && -t 1 ]]; then
  COLOR_BLUE=$'\033[1;34m'
  COLOR_GREEN=$'\033[1;32m'
  COLOR_YELLOW=$'\033[1;33m'
  COLOR_RED=$'\033[1;31m'
  COLOR_RESET=$'\033[0m'
else
  COLOR_BLUE=''
  COLOR_GREEN=''
  COLOR_YELLOW=''
  COLOR_RED=''
  COLOR_RESET=''
fi

phase() {
  printf '%s==> %s%s\n' "${COLOR_BLUE}" "$*" "${COLOR_RESET}"
}

ok() {
  printf '%s[ok]%s %s\n' "${COLOR_GREEN}" "${COLOR_RESET}" "$*"
}

warn() {
  printf '%s[warn]%s %s\n' "${COLOR_YELLOW}" "${COLOR_RESET}" "$*" >&2
}

die() {
  printf '%s[fail]%s %s\n' "${COLOR_RED}" "${COLOR_RESET}" "$*" >&2
  exit 1
}
