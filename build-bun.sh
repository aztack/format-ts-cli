#!/usr/bin/env bash
set -euo pipefail

# Resolve the root directory of the project (directory of this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"

ENTRY="$ROOT_DIR/bin/format-ts.js"
BIN_DIR="$ROOT_DIR/bin"
NODE_MODULES_DIR="$ROOT_DIR/node_modules"

echo "[build-bun] Project root: $ROOT_DIR"

# Check Bun availability
if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is not installed or not in PATH." >&2
  echo "Please install Bun from https://bun.sh/ and ensure 'bun' is available on your PATH." >&2
  exit 2
fi

# Basic check: entry file must exist
if [ ! -f "$ENTRY" ]; then
  echo "Error: entry file not found: $ENTRY" >&2
  echo "Make sure the CLI has been built and bin/format-ts.js exists." >&2
  exit 2
fi

# Ensure node_modules exists; if not, run npm install in ROOT_DIR
if [ ! -d "$NODE_MODULES_DIR" ]; then
  echo "[build-bun] node_modules not found. Running 'npm install' in $ROOT_DIR ..."
  (cd "$ROOT_DIR" && npm install)
else
  echo "[build-bun] Reusing existing node_modules at $NODE_MODULES_DIR"
fi

# Ensure bin directory exists
if [ ! -d "$BIN_DIR" ]; then
  echo "[build-bun] Creating bin directory at $BIN_DIR"
  mkdir -p "$BIN_DIR"
fi

# Note: Bun does not currently provide a bun-windows-arm64 target, so Windows ARM64
# executables cannot be cross-compiled with this script yet.

# Default targets (Bun --target string → outfile path)
DEFAULT_TARGETS=(
  "bun-darwin-arm64:$BIN_DIR/format-ts-darwin-arm64"
  "bun-darwin-x64:$BIN_DIR/format-ts-darwin-x64"
  "bun-linux-arm64:$BIN_DIR/format-ts-linux-arm64"
  "bun-linux-x64-baseline:$BIN_DIR/format-ts-linux-x64"
  "bun-windows-x64-baseline:$BIN_DIR/format-ts-windows-x64.exe"
)

BUILD_TARGETS=()
BUILD_SUCCEEDED=()
BUILD_FAILED=()

resolve_outfile() {
  local target="$1"
  case "$target" in
    bun-darwin-arm64) echo "$BIN_DIR/format-ts-darwin-arm64" ;;
    bun-darwin-x64) echo "$BIN_DIR/format-ts-darwin-x64" ;;
    bun-linux-arm64) echo "$BIN_DIR/format-ts-linux-arm64" ;;
    bun-linux-x64-baseline) echo "$BIN_DIR/format-ts-linux-x64" ;;
    bun-windows-x64-baseline) echo "$BIN_DIR/format-ts-windows-x64.exe" ;;
    *) echo "" ;;
  esac
}

# Allow overriding targets via TARGETS env (comma-separated). TARGETS=all uses the defaults.
if [ "${TARGETS-}" != "" ]; then
  if [ "$TARGETS" = "all" ]; then
    BUILD_TARGETS=("${DEFAULT_TARGETS[@]}")
  else
    IFS=',' read -r -a _requested_targets <<<"$TARGETS"
    for _raw in "${_requested_targets[@]}"; do
      _t="$_raw"
      # trim leading whitespace
      _t="${_t#"${_t%%[![:space:]]*}"}"
      # trim trailing whitespace
      _t="${_t%"${_t##*[![:space:]]}"}"
      if [ -z "$_t" ]; then
        continue
      fi
      _outfile="$(resolve_outfile "$_t")"
      if [ -z "$_outfile" ]; then
        echo "[build-bun] Warning: unsupported target '$_t' - skipping" >&2
      else
        BUILD_TARGETS+=("$_t:$_outfile")
      fi
    done

    if [ "${#BUILD_TARGETS[@]}" -eq 0 ]; then
      echo "[build-bun] Error: no valid targets to build from TARGETS='$TARGETS'" >&2
      exit 1
    fi
  fi
else
  BUILD_TARGETS=("${DEFAULT_TARGETS[@]}")
fi

build_one() {
  local target="$1"
  local outfile="$2"

  echo "[build-bun] Building: $target -> $outfile"

  if bun build --compile --target="$target" "$ENTRY" --outfile "$outfile"; then
    if [[ "$outfile" != *.exe ]]; then
      chmod +x "$outfile" || true
    fi
    BUILD_SUCCEEDED+=("$target:$outfile")
    echo "[build-bun] Success: $target"
  else
    BUILD_FAILED+=("$target:$outfile")
    echo "[build-bun] Failed: $target" >&2
  fi
}

echo "[build-bun] Targets to build:"
for entry in "${BUILD_TARGETS[@]}"; do
  IFS=':' read -r target outfile <<<"$entry"
  echo "  - $target -> $outfile"
done

echo "[build-bun] Starting builds..."
for entry in "${BUILD_TARGETS[@]}"; do
  IFS=':' read -r target outfile <<<"$entry"
  build_one "$target" "$outfile"
done

echo
echo "[build-bun] Build summary:"
printf '  %-24s %-10s %s
' "Target" "Status" "Output"

for entry in "${BUILD_TARGETS[@]}"; do
  IFS=':' read -r target outfile <<<"$entry"
  status="FAILED"

  for s in "${BUILD_SUCCEEDED[@]}"; do
    if [[ "$s" == "$target:"* ]]; then
      status="OK"
      break
    fi
  done

  printf '  %-24s %-10s %s
' "$target" "$status" "$outfile"
done

if [ "${#BUILD_FAILED[@]}" -gt 0 ]; then
  echo
  echo "[build-bun] Some targets failed:"
  for entry in "${BUILD_FAILED[@]}"; do
    IFS=':' read -r target outfile <<<"$entry"
    echo "  - $target (outfile: $outfile)"
  done
  exit 1
fi

echo
echo "[build-bun] All targets built successfully."
