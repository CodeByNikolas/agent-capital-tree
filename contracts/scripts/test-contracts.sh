#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
forge_bin="${FORGE_BIN:-forge}"

# solc-js 0.8.26 on ARM64 can exhaust its WASM memory when Foundry batches
# all sources in one cold compile. The compiler version and flags remain the
# same; only compilation is split into smaller independent units.
"$forge_bin" build --skip test --silent
"$forge_bin" build lib/v4-core/src/PoolManager.sol --silent
"$forge_bin" build lib/v4-periphery/src/PositionManager.sol --silent
for test_file in test/*.t.sol; do
    "$forge_bin" build "$test_file" --silent
done
"$forge_bin" test
