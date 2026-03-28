#!/usr/bin/env bash
# install.sh — Install the TRAE OpenClaw MCP extension into TRAE

set -e

EXTENSION_DIR="$HOME/.config/Trae/extensions/trae-openclaw-mcp"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== TRAE OpenClaw MCP Extension Installer ==="

# Step 1: Compile TypeScript
echo "[1/4] Compiling TypeScript..."
cd "$SCRIPT_DIR"
if ! command -v npx &>/dev/null; then
    echo "ERROR: npx not found. Install Node.js first."
    exit 1
fi

# Use Node 24 if available (for modern TypeScript support)
if [ -f "$HOME/.nvm/versions/node/v24.14.0/bin/node" ]; then
    export PATH="$HOME/.nvm/versions/node/v24.14.0/bin:$PATH"
fi

npm install --silent 2>/dev/null || npm install
npx tsc -p ./

# Step 2: Copy to TRAE extensions directory
echo "[2/4] Copying to $EXTENSION_DIR..."
rm -rf "$EXTENSION_DIR"
mkdir -p "$(dirname "$EXTENSION_DIR")"
cp -r "$SCRIPT_DIR" "$EXTENSION_DIR"

# Step 3: Verify
echo "[3/4] Verifying installation..."
if [ -f "$EXTENSION_DIR/dist/extension.js" ]; then
    echo "  ✓ extension.js found"
else
    echo "  ✗ ERROR: extension.js not found after copy"
    exit 1
fi

# Step 4: Remind user to activate
echo "[4/4] Installation complete!"
echo ""
echo "=== Next Steps ==="
echo "1. Open TRAE IDE"
echo "2. Run: Ctrl+Shift+P → 'Developer: Reload Window'"
echo "3. Run: Ctrl+Shift+P → 'TRAE MCP: Start Server'"
echo "4. Verify: Ctrl+Shift+P → 'TRAE MCP: Status'"
echo ""
echo "The MCP server will listen on /tmp/trae-openclaw-mcp.sock"
