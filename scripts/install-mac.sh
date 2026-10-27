#!/bin/zsh
# Installs Bruma into /Applications and signs it with a stable local certificate, so macOS keeps
# the Microphone and Accessibility permissions across updates.
#
#   ./scripts/install-mac.sh             # latest release from GitHub (no account needed)
#   ./scripts/install-mac.sh v0.7.0      # a specific release
#   ./scripts/install-mac.sh 1234567890  # a CI build (needs GitHub CLI: brew install gh)
set -euo pipefail

REPO="${BRUMA_REPO:-yairhdz24/bruma}"
IDENTITY="Bruma Local Signing"
TARGET="${1:-latest}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# 1. One time: a self-signed code-signing identity in your login keychain. It never leaves your Mac.
if ! security find-identity -p codesigning | grep -q "\"$IDENTITY\""; then
  echo "Creando el certificado local \"$IDENTITY\" (solo esta vez)…"
  openssl req -x509 -newkey rsa:2048 -keyout "$work/key.pem" -out "$work/cert.pem" -days 3650 -nodes \
    -subj "/CN=$IDENTITY" -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=critical,codeSigning" -addext "basicConstraints=critical,CA:false" 2>/dev/null
  pass=$(openssl rand -hex 12)
  openssl pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" -name "$IDENTITY" -out "$work/id.p12" -passout "pass:$pass"
  security import "$work/id.p12" -k ~/Library/Keychains/login.keychain-db -P "$pass" -T /usr/bin/codesign >/dev/null
  rm -f "$work/key.pem" "$work/id.p12"
  echo "Para que la firma no vuelva a pedir tu contraseña, ejecuta una vez:"
  echo "  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -l \"$IDENTITY\" ~/Library/Keychains/login.keychain-db"
fi

# 2. Download.
if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  command -v gh >/dev/null || { echo "Instala GitHub CLI: brew install gh"; exit 1; }
  echo "Descargando la compilación $TARGET…"
  gh run download "$TARGET" -R "$REPO" -n Bruma-macOS-Apple-Silicon -D "$work"
  ditto -x -k "$work/Bruma-macOS.app.zip" "$work"
else
  api="https://api.github.com/repos/$REPO/releases/$([[ "$TARGET" == latest ]] && echo latest || echo "tags/$TARGET")"
  url=$(curl -fsSL "$api" | grep -o '"browser_download_url": *"[^"]*\.dmg"' | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
  [[ -n "$url" ]] || { echo "No encontré un instalador para \"$TARGET\"."; exit 1; }
  echo "Descargando $url…"
  curl -fL --progress-bar "$url" -o "$work/Bruma.dmg"
  mount=$(hdiutil attach -nobrowse -readonly "$work/Bruma.dmg" | tail -1 | sed 's/.*\(\/Volumes\/.*\)/\1/')
  ditto "$mount/Bruma.app" "$work/Bruma.app"
  hdiutil detach "$mount" -quiet
fi

# 3. Sign with the stable identity (keeps the build's entitlements and hardened runtime).
codesign --force --deep --preserve-metadata=entitlements,flags -s "$IDENTITY" "$work/Bruma.app"

# 4. Replace the installed app and open it.
osascript -e 'tell application id "com.bruma.voice.personal" to quit' >/dev/null 2>&1 || true
sleep 1
rm -rf /Applications/Bruma.app
ditto "$work/Bruma.app" /Applications/Bruma.app
xattr -dr com.apple.quarantine /Applications/Bruma.app 2>/dev/null || true
open /Applications/Bruma.app
echo "Bruma $(defaults read /Applications/Bruma.app/Contents/Info CFBundleShortVersionString) instalada y firmada con \"$IDENTITY\"."
