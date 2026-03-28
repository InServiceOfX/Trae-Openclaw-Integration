#!/usr/bin/env python3
"""
mcp_client.py — Python MCP client for TRAE OpenClaw Integration

Connects to the TRAE MCP Unix socket server and sends JSON-RPC requests.

Usage:
    python3 mcp_client.py <method> [params_json]
    python3 mcp_client.py ping
    python3 mcp_client.py tools/call '{"name":"get_workspace","arguments":{}}'
"""

import socket
import json
import sys
import uuid
import os

SOCKET_PATH = os.environ.get("TRAE_MCP_SOCK", "/tmp/trae-openclaw-mcp.sock")

def send_rpc(sock, method, params=None, req_id=None):
    if req_id is None:
        req_id = str(uuid.uuid4())
    request = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
        "params": params or {}
    }
    sock.sendall((json.dumps(request) + "\n").encode("utf-8"))
    response_raw = b""
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            break
        response_raw += chunk
        try:
            response = json.loads(response_raw.decode("utf-8"))
            return response
        except json.JSONDecodeError:
            continue
    return None

def main():
    if len(sys.argv) < 2:
        print("Usage: mcp_client.py <method> [params_json]")
        print("  method: ping, tools/list, tools/call")
        print("  params: JSON string or {} for empty")
        sys.exit(1)

    method = sys.argv[1]
    params = {}
    if len(sys.argv) > 2:
        try:
            params = json.loads(sys.argv[2])
        except json.JSONDecodeError as e:
            print(f"ERROR: Invalid JSON params: {e}")
            sys.exit(1)

    if not os.path.exists(SOCKET_PATH):
        print(f"ERROR: Socket not found: {SOCKET_PATH}")
        print("Start the MCP server in TRAE first: Ctrl+Shift+P → 'TRAE MCP: Start Server'")
        sys.exit(1)

    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect(SOCKET_PATH)
    except Exception as e:
        print(f"ERROR: Could not connect to {SOCKET_PATH}: {e}")
        sys.exit(1)

    try:
        response = send_rpc(sock, method, params)
        if response is None:
            print("ERROR: No response received")
            sys.exit(1)
        print(json.dumps(response, indent=2))
    finally:
        sock.close()

if __name__ == "__main__":
    main()
