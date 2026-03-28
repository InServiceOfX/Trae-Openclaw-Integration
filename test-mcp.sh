#!/usr/bin/env bash
# test-mcp.sh — Test script for the TRAE MCP server

SOCK="${TRAE_MCP_SOCK:-/tmp/trae-openclaw-mcp.sock}"
REQ_ID="${TRAE_MCP_REQ_ID:-1}"

send_rpc() {
    local method="$1"
    local params="${2:-{}}"
    echo "Sending: $method"
    echo "{\"jsonrpc\":\"2.0\",\"id\":$REQ_ID,\"method\":\"$method\",\"params\":$params}" | nc -U "$SOCK" -w 2
    echo ""
    ((REQ_ID++))
}

echo "=== TRAE MCP Test Client ==="
echo "Socket: $SOCK"
echo ""

if [ ! -S "$SOCK" ]; then
    echo "ERROR: Socket $SOCK does not exist."
    echo "Start the MCP server in TRAE first: Ctrl+Shift+P → 'TRAE MCP: Start Server'"
    exit 1
fi

echo "--- Test: ping ---"
send_rpc "ping" "{}"

echo "--- Test: get_workspace ---"
send_rpc "tools/call" '{"name":"get_workspace","arguments":{}}'

echo "--- Test: list_dir (.) ---"
send_rpc "tools/call" '{"name":"list_dir","arguments":{"path":""}}'

echo ""
echo "Done. Request IDs used: 1-$((REQ_ID - 1))"
