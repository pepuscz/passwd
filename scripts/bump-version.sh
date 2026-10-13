#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 OLD_VERSION NEW_VERSION"
  echo "Example: $0 1.5.0 1.6.0"
  exit 1
fi

OLD="$1"
NEW="$2"

SEMVER='^[0-9]+\.[0-9]+\.[0-9]+$'
if ! [[ "$OLD" =~ $SEMVER && "$NEW" =~ $SEMVER ]]; then
  echo "Versions must be plain X.Y.Z, got: $OLD -> $NEW"
  exit 1
fi

# Match OLD literally (dots are not wildcards) and only as a whole version,
# so 1.6.1 does not match inside 11.6.1, 1.6.10 or 1x6y1.
# perl -pi works the same with BSD and GNU userlands, unlike sed -i.
replace_version() {
  OLD="$OLD" NEW="$NEW" perl -pi -e 's/(?<![0-9.])\Q$ENV{OLD}\E(?!\.?[0-9])/$ENV{NEW}/g' "$1"
}

has_version() {
  OLD="$OLD" perl -ne '$found = 1 if /(?<![0-9.])\Q$ENV{OLD}\E(?!\.?[0-9])/; END { exit($found ? 0 : 1) }' "$1"
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# All files that contain the version string (excluding node_modules, dist, lockfile)
FILES=(
  "$ROOT/packages/passwd-lib/package.json"
  "$ROOT/packages/passwd-mcp/package.json"
  "$ROOT/packages/passwd-mcp/src/index.ts"
  "$ROOT/packages/passwd-mcpb/package.json"
  "$ROOT/packages/passwd-mcpb/manifest.json"
  "$ROOT/packages/passwd-mcpb/src/index.ts"
  "$ROOT/packages/passwd-cli/package.json"
  "$ROOT/packages/passwd-cli/src/index.ts"
  "$ROOT/packages/passwd-agent-cli/package.json"
  "$ROOT/packages/passwd-agent-cli/src/index.ts"
  "$ROOT/README.md"
)

CHANGED=0
for f in "${FILES[@]}"; do
  if has_version "$f"; then
    replace_version "$f"
    CHANGED=$((CHANGED + 1))
    echo "  updated: ${f#$ROOT/}"
  else
    echo "  WARNING: $OLD not found in ${f#$ROOT/}"
  fi
done

echo ""
echo "Updated $CHANGED files: $OLD → $NEW"
echo ""
echo "Next steps:"
echo "  npm install          # regenerate lockfile"
echo "  npm run build        # verify it compiles"
echo "  npm test             # run unit tests"
echo ""

# Verify no old version remains
REMAINING=$(grep -rnF "$OLD" --include="*.json" --include="*.ts" --include="*.md" "$ROOT" \
  | grep -v -e node_modules -e package-lock -e /dist/ -e '.tsbuildinfo' \
  | OLD="$OLD" perl -ne 'print if /(?<![0-9.])\Q$ENV{OLD}\E(?!\.?[0-9])/' || true)

if [ -n "$REMAINING" ]; then
  echo "WARNING: Old version $OLD still found in:"
  echo "$REMAINING"
  exit 1
else
  echo "Verified: no remaining references to $OLD"
fi
