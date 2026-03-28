#!/usr/bin/env python3
"""
mcp_client.py — Robust Python MCP client for TRAE OpenClaw Integration

Connects to the TRAE MCP Unix socket server and sends JSON-RPC requests.

Usage:
    python3 mcp_client.py <method> [params_json]    # one-shot mode
    python3 mcp_client.py repl                       # interactive REPL
    python3 mcp_client.py ping
    python3 mcp_client.py tools/list
    python3 mcp_client.py tools/call '{"name":"get_workspace","arguments":{}}'
    python3 mcp_client.py call read_file '{"path":"README.md"}'
    python3 mcp_client.py call list_dir '{}'
    python3 mcp_client.py call write_file '{"path":"hello.txt","content":"Hello!"}'

Environment:
    TRAE_MCP_SOCK  — override socket path (default: /tmp/trae-openclaw-mcp.sock)
    NO_COLOR       — disable color output
"""

import socket
import json
import sys
import uuid
import os
import time
import readline  # noqa: F401 — enables history in REPL

# ─── Configuration ────────────────────────────────────────────────────────────

SOCKET_PATH = os.environ.get("TRAE_MCP_SOCK", "/tmp/trae-openclaw-mcp.sock")
CONNECT_RETRIES = 5
CONNECT_RETRY_DELAY = 1.0  # seconds
RECV_TIMEOUT = 15.0  # seconds

# ─── Colors ───────────────────────────────────────────────────────────────────

def _supports_color() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()

USE_COLOR = _supports_color()

class C:
    RESET  = "\033[0m"    if USE_COLOR else ""
    BOLD   = "\033[1m"    if USE_COLOR else ""
    DIM    = "\033[2m"    if USE_COLOR else ""
    GREEN  = "\033[32m"   if USE_COLOR else ""
    YELLOW = "\033[33m"   if USE_COLOR else ""
    CYAN   = "\033[36m"   if USE_COLOR else ""
    RED    = "\033[31m"   if USE_COLOR else ""
    BLUE   = "\033[34m"   if USE_COLOR else ""
    MAGENTA = "\033[35m"  if USE_COLOR else ""

def info(msg):    print(f"{C.CYAN}ℹ {msg}{C.RESET}", file=sys.stderr)
def ok(msg):      print(f"{C.GREEN}✓ {msg}{C.RESET}", file=sys.stderr)
def warn(msg):    print(f"{C.YELLOW}⚠ {msg}{C.RESET}", file=sys.stderr)
def error(msg):   print(f"{C.RED}✗ {msg}{C.RESET}", file=sys.stderr)
def section(msg): print(f"\n{C.BOLD}{C.BLUE}── {msg} ──{C.RESET}", file=sys.stderr)

def pretty_json(obj) -> str:
    """Colorized JSON output."""
    raw = json.dumps(obj, indent=2)
    if not USE_COLOR:
        return raw
    lines = []
    for line in raw.splitlines():
        stripped = line.lstrip()
        if stripped.startswith('"') and ': ' in stripped:
            # key: value line
            key, _, rest = stripped.partition(': ')
            indent = line[:len(line) - len(stripped)]
            lines.append(f"{indent}{C.CYAN}{key}{C.RESET}: {_colorize_value(rest)}")
        elif stripped.startswith('"'):
            indent = line[:len(line) - len(stripped)]
            lines.append(f"{indent}{C.YELLOW}{stripped}{C.RESET}")
        elif stripped in ('{', '}', '[', ']', '{,', '},', '[,', '],'):
            lines.append(f"{C.DIM}{line}{C.RESET}")
        else:
            lines.append(line)
    return "\n".join(lines)

def _colorize_value(val_str: str) -> str:
    v = val_str.strip().rstrip(',')
    trailing = val_str[len(val_str.rstrip(',')):]
    if v.startswith('"'):
        return f"{C.GREEN}{val_str}{C.RESET}"
    if v in ('true', 'false', 'null'):
        return f"{C.MAGENTA}{val_str}{C.RESET}"
    try:
        float(v)
        return f"{C.YELLOW}{val_str}{C.RESET}"
    except ValueError:
        pass
    return val_str

# ─── Socket Connection ────────────────────────────────────────────────────────

def connect(socket_path: str = SOCKET_PATH, retries: int = CONNECT_RETRIES) -> socket.socket:
    """Connect to the MCP Unix socket, retrying if not ready."""
    for attempt in range(1, retries + 1):
        if not os.path.exists(socket_path):
            if attempt < retries:
                warn(f"Socket not found: {socket_path} (attempt {attempt}/{retries}), retrying in {CONNECT_RETRY_DELAY}s...")
                time.sleep(CONNECT_RETRY_DELAY)
                continue
            else:
                raise ConnectionError(
                    f"Socket not found: {socket_path}\n"
                    "Start the MCP server in TRAE: Ctrl+Shift+P → 'TRAE MCP: Start Server'"
                )
        try:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(RECV_TIMEOUT)
            sock.connect(socket_path)
            return sock
        except (ConnectionRefusedError, OSError) as e:
            if attempt < retries:
                warn(f"Connection failed ({e}), retrying {attempt}/{retries}...")
                time.sleep(CONNECT_RETRY_DELAY)
            else:
                raise ConnectionError(f"Could not connect to {socket_path}: {e}") from e
    raise ConnectionError("Exhausted retries")

# ─── JSON-RPC ─────────────────────────────────────────────────────────────────

def send_rpc(sock: socket.socket, method: str, params=None, req_id=None) -> dict:
    """Send a JSON-RPC 2.0 request and return the response."""
    if req_id is None:
        req_id = str(uuid.uuid4())
    request = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
        "params": params or {}
    }
    payload = (json.dumps(request) + "\n").encode("utf-8")
    sock.sendall(payload)

    response_raw = b""
    while True:
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            raise TimeoutError(f"No response within {RECV_TIMEOUT}s")
        if not chunk:
            break
        response_raw += chunk
        # Try to parse — handle multiple newline-delimited responses
        for line in response_raw.decode("utf-8", errors="replace").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

    # Last attempt with full buffer
    try:
        return json.loads(response_raw.decode("utf-8").strip())
    except json.JSONDecodeError as e:
        raise ValueError(f"Could not parse response: {e}\nRaw: {response_raw[:500]}")


def call_tool(sock: socket.socket, name: str, params: dict = None) -> dict:
    """
    Call an MCP tool by name with parameters.

    Returns the parsed result dict (or raises on error).

    Example:
        sock = connect()
        result = call_tool(sock, "read_file", {"path": "README.md"})
        print(result["content"])
    """
    response = send_rpc(sock, "tools/call", {
        "name": name,
        "arguments": params or {}
    })
    if "error" in response:
        raise RuntimeError(f"Tool '{name}' error: {response['error']}")
    # Unwrap MCP content envelope
    result = response.get("result", {})
    content = result.get("content", [])
    if content and isinstance(content, list):
        text = content[0].get("text", "")
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            return {"text": text}
    return result

# ─── REPL ─────────────────────────────────────────────────────────────────────

REPL_HELP = f"""
{C.BOLD}TRAE MCP Interactive REPL{C.RESET}

Commands:
  {C.CYAN}ping{C.RESET}                              — check connection
  {C.CYAN}tools{C.RESET}                             — list available tools
  {C.CYAN}<tool_name> [json_params]{C.RESET}         — call a tool

Tool shortcut examples:
  {C.CYAN}get_workspace{C.RESET}
  {C.CYAN}list_dir{C.RESET}
  {C.CYAN}list_dir {{"path": "extension/src"}}{C.RESET}
  {C.CYAN}read_file {{"path": "README.md"}}{C.RESET}
  {C.CYAN}write_file {{"path": "test.txt", "content": "hello"}}{C.RESET}
  {C.CYAN}search_codebase {{"query": "TODO", "pattern": "*.ts"}}{C.RESET}
  {C.CYAN}run_command {{"command": "ls -la"}}{C.RESET}
  {C.CYAN}invoke_solo_agent {{"task": "Add comments to extension.ts"}}{C.RESET}

Special:
  {C.CYAN}help{C.RESET} or {C.CYAN}?{C.RESET}                      — show this help
  {C.CYAN}quit{C.RESET} or {C.CYAN}exit{C.RESET}                    — exit REPL
  {C.CYAN}reconnect{C.RESET}                         — reconnect to socket
"""

def repl():
    """Interactive REPL for testing MCP tools."""
    section("TRAE MCP REPL")
    info(f"Socket: {SOCKET_PATH}")

    sock = None
    try:
        info("Connecting...")
        sock = connect()
        ok(f"Connected to {SOCKET_PATH}")
    except ConnectionError as e:
        error(str(e))
        sys.exit(1)

    print(REPL_HELP)

    # Fetch tool list
    known_tools = []
    try:
        resp = send_rpc(sock, "tools/list")
        known_tools = [t["name"] for t in resp.get("result", {}).get("tools", [])]
        info(f"Available tools: {', '.join(known_tools)}")
    except Exception as e:
        warn(f"Could not fetch tool list: {e}")

    while True:
        try:
            line = input(f"\n{C.BOLD}{C.BLUE}mcp>{C.RESET} ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not line:
            continue

        if line in ("exit", "quit", "q"):
            break

        if line in ("help", "?"):
            print(REPL_HELP)
            continue

        if line == "reconnect":
            try:
                if sock:
                    sock.close()
                sock = connect()
                ok(f"Reconnected to {SOCKET_PATH}")
            except ConnectionError as e:
                error(str(e))
            continue

        if line == "ping":
            try:
                resp = send_rpc(sock, "ping")
                ok("Pong!")
                print(pretty_json(resp))
            except Exception as e:
                error(f"Ping failed: {e}")
                _try_reconnect(sock)
            continue

        if line == "tools":
            try:
                resp = send_rpc(sock, "tools/list")
                tools_data = resp.get("result", {}).get("tools", [])
                for t in tools_data:
                    print(f"  {C.CYAN}{t['name']}{C.RESET}")
            except Exception as e:
                error(f"Failed to list tools: {e}")
            continue

        # Parse tool_name [json_params]
        parts = line.split(None, 1)
        tool_name = parts[0]
        params_str = parts[1] if len(parts) > 1 else "{}"

        try:
            params = json.loads(params_str)
        except json.JSONDecodeError as e:
            error(f"Invalid JSON params: {e}")
            warn("Tip: wrap strings in double quotes, e.g.: read_file {\"path\": \"README.md\"}")
            continue

        try:
            result = call_tool(sock, tool_name, params)
            ok(f"Result from '{tool_name}':")
            print(pretty_json(result))
        except RuntimeError as e:
            error(str(e))
        except Exception as e:
            error(f"Unexpected error: {e}")
            sock = _try_reconnect(sock)

    info("Goodbye!")
    if sock:
        sock.close()

def _try_reconnect(sock) -> socket.socket:
    """Attempt to reconnect and return new socket (or old one on failure)."""
    try:
        if sock:
            sock.close()
    except Exception:
        pass
    try:
        warn("Attempting to reconnect...")
        new_sock = connect(retries=2)
        ok("Reconnected!")
        return new_sock
    except ConnectionError as e:
        error(f"Reconnect failed: {e}")
        return sock

# ─── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    mode = args[0]

    # REPL mode
    if mode == "repl":
        repl()
        return

    # Shortcut: call <tool_name> [params]
    if mode == "call":
        if len(args) < 2:
            error("Usage: mcp_client.py call <tool_name> [params_json]")
            sys.exit(1)
        tool_name = args[1]
        params = {}
        if len(args) > 2:
            try:
                params = json.loads(args[2])
            except json.JSONDecodeError as e:
                error(f"Invalid JSON params: {e}")
                sys.exit(1)

        try:
            sock = connect()
        except ConnectionError as e:
            error(str(e))
            sys.exit(1)

        try:
            result = call_tool(sock, tool_name, params)
            print(pretty_json(result))
        except Exception as e:
            error(str(e))
            sys.exit(1)
        finally:
            sock.close()
        return

    # Raw JSON-RPC: mcp_client.py <method> [params_json]
    method = mode
    params = {}
    if len(args) > 1:
        try:
            params = json.loads(args[1])
        except json.JSONDecodeError as e:
            error(f"Invalid JSON params: {e}")
            sys.exit(1)

    try:
        sock = connect()
    except ConnectionError as e:
        error(str(e))
        sys.exit(1)

    try:
        response = send_rpc(sock, method, params)
        if response is None:
            error("No response received")
            sys.exit(1)
        print(pretty_json(response))
    except Exception as e:
        error(str(e))
        sys.exit(1)
    finally:
        sock.close()


if __name__ == "__main__":
    main()
