#!/usr/bin/env bash
set -euo pipefail

# update-build-version.sh
# For GH Actions: updates package.json and src/__version__.ts based on latest tag.
# Supports tags:
#   - vM.m.p        -> package.json: "M.m.p"      , src: "vM.m.p"
#   - vM.m.p.h      -> package.json: "M.m.p-h"    , src: "vM.m.p.h"
# Changes are NOT committed.

ROOT_PACKAGE_JSON="package.json"
VERSION_TS="src/__version__.ts"

fail() { echo "ERROR: $*" >&2; exit 1; }

[[ -f "$ROOT_PACKAGE_JSON" ]] || fail "Expected $ROOT_PACKAGE_JSON in current directory."
[[ -f "$VERSION_TS" ]] || fail "Expected $VERSION_TS (run from repo root)."

# Ensure tags are fetched in CI
git fetch --tags --quiet || true

# Find latest tag matching vM.m.p OR vM.m.p.h (hotfix)
latest_tag="$(
  git tag --list 'v[0-9]*.[0-9]*.[0-9]*' 'v[0-9]*.[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname \
    | head -n 1 || true
)"

[[ -n "$latest_tag" ]] || fail "No tags found matching vM.m.p or vM.m.p.h (e.g., v1.2.3 or v1.2.3.1)."

# Validate and parse: vM.m.p or vM.m.p.h
if [[ ! "$latest_tag" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)(\.([0-9]+))?$ ]]; then
  fail "Latest tag '$latest_tag' is not in vM.m.p or vM.m.p.h format."
fi

major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"
hotfix="${BASH_REMATCH[5]:-}"   # empty if not present

# Build versions:
# package.json version: M.m.p  OR  M.m.p-h  (no leading v)
if [[ -n "$hotfix" ]]; then
  pkg_version="${major}.${minor}.${patch}-${hotfix}"   # e.g., 1.2.3-1
else
  pkg_version="${major}.${minor}.${patch}"             # e.g., 1.2.3
fi

# src/__version__.ts sdkVersion value: vM.m.p  OR  vM.m.p.h  (leading v)
if [[ -n "$hotfix" ]]; then
  src_version="v${major}.${minor}.${patch}.${hotfix}"  # e.g., v1.2.3.1
else
  src_version="v${major}.${minor}.${patch}"            # e.g., v1.2.3
fi

echo "Latest tag : $latest_tag"
echo "Package.json version => $pkg_version"
echo "src/__version__.ts  => $src_version"

# --- Update package.json "version" field ---
if command -v jq >/dev/null 2>&1; then
  tmp="$(mktemp)"
  jq --arg v "$pkg_version" '.version = $v' "$ROOT_PACKAGE_JSON" > "$tmp" || fail "jq failed to write $ROOT_PACKAGE_JSON"
  mv "$tmp" "$ROOT_PACKAGE_JSON"
else
  # Fallback sed: replace top-level "version": "x.y.z" or "x.y.z-..." (will handle existing pre-release)
  # This attempts to find the first "version" key and replace its value.
  # Works for common package.json layouts.
  sed -E -i.bak "0,/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]*(\")/s//\1${pkg_version}\2/" "$ROOT_PACKAGE_JSON" \
    || fail "Failed to update $ROOT_PACKAGE_JSON (sed fallback)."
  rm -f "${ROOT_PACKAGE_JSON}.bak"
fi

# --- Update src/__version__.ts ---
# Replace the sdkVersion exported value (tolerant of whitespace and quotes).
# Example line to match:
#   export const sdkVersion = "0.9.1";
# We will set it to "vM.m.p" or "vM.m.p.h" per mapping above.
escaped_src_version="${src_version//\"/\\\"}"  # just in case

# Try a robust perl-compatible sed if available, otherwise basic sed.
# Match patterns with or without leading export whitespace and different quote styles.
if sed --version >/dev/null 2>&1; then
  # GNU sed: use in-place replacement with extended regex
  sed -E -i.bak \
    "s/^(export[[:space:]]+const[[:space:]]+sdkVersion[[:space:]]*=[[:space:]]*)(['\"]).*(\2[[:space:]]*;[[:space:]]*)$/\\1\"${escaped_src_version}\";/" \
    "$VERSION_TS" || fail "Failed to update $VERSION_TS (sed)"
  rm -f "${VERSION_TS}.bak"
else
  # macOS / BSD sed or other: use perl if available, else try POSIX sed
  if command -v perl >/dev/null 2>&1; then
    perl -0777 -pe "s/^(export\s+const\s+sdkVersion\s*=\s*)(['\"]).*?(\2\s*;)/\${1}\"${escaped_src_version}\";/ms" -i.bak "$VERSION_TS" \
      || fail "Failed to update $VERSION_TS (perl)"
    rm -f "${VERSION_TS}.bak"
  else
    sed -E -i.bak "s/^(export[[:space:]]+const[[:space:]]+sdkVersion[[:space:]]*=[[:space:]]*)(['\"]).*(\2[[:space:]]*;[[:space:]]*)$/\\1\"${escaped_src_version}\";/" "$VERSION_TS" \
      || fail "Failed to update $VERSION_TS (fallback sed)"
    rm -f "${VERSION_TS}.bak"
  fi
fi

# --- Post-update sanity checks ---
# Check package.json has the expected version value
if command -v jq >/dev/null 2>&1; then
  got_pkg_version="$(jq -r .version "$ROOT_PACKAGE_JSON")"
  [[ "$got_pkg_version" == "$pkg_version" ]] || fail "package.json version mismatch: expected $pkg_version got $got_pkg_version"
else
  # grep for "version": "VALUE"
  if ! grep -Eq "\"version\"[[:space:]]*:[[:space:]]*\"${pkg_version}\"" "$ROOT_PACKAGE_JSON"; then
    fail "package.json post-update check failed: version not set to ${pkg_version}"
  fi
fi

# Check src version line
# Build regex escaped for dots
src_ver_esc="${src_version//./\\.}"
if ! grep -Eq "^export[[:space:]]+const[[:space:]]+sdkVersion[[:space:]]*=[[:space:]]*\"${src_ver_esc}\"[[:space:]]*;[[:space:]]*$" "$VERSION_TS"; then
  fail "src/__version__.ts post-update check failed: sdkVersion not set to \"${src_version}\""
fi

echo "Updated files (not committed):"
echo "  - $ROOT_PACKAGE_JSON -> version: $pkg_version"
echo "  - $VERSION_TS -> sdkVersion: $src_version"
