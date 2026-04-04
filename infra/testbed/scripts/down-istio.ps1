$ErrorActionPreference = "Stop"

if (Get-Command kind -ErrorAction SilentlyContinue) {
  $clusters = kind get clusters
  if ($clusters -contains "prism-testbed") {
    kind delete cluster --name prism-testbed
  }
}
