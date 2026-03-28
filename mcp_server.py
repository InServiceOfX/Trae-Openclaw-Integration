#!/usr/bin/env python3
"""
mcp_server.py — Standalone MCP server for TRAE OpenClaw Integration

This is a standalone MCP server that TRAE can connect to via stdio.
Run this as a subprocess and communicate via JSON-RPC on stdin/stdout.

Usage:
    python3 mcp_server.py

Or register in ~/.config/Trae/mcp.json:
{
  "mcpServers": {
    "trae-openclaw": {
      "command": "python3",
      "args": ["/path/to/mcp_server.py"]
    }
  }
}
"""

import sys
import json
import uuid
import os
from pathlib import Path

# ─── Tool Implementations ───────────────────────────────────────────────────────

def read_file_tool(path: str) -> dict:
    abs_path = os.path.abspath(os.path.expanduser(path))
    try:
        with open(abs_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return {"path": abs_path, "content": content, "size": len(content)}
    except Exception as e:
        raise Exception(f"Failed to read {abs_path}: {e}")

def write_file_tool(path: str, content: str) -> dict:
    abs_path = os.path.abspath(os.path.expanduser(path))
    try:
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return {"path": abs_path, "written": True, "size": len(content)}
    except Exception as e:
        raise Exception(f"Failed to write {abs_path}: {e}")

def list_dir_tool(path: str = "") -> dict:
    abs_path = os.path.abspath(os.path.expanduser(path)) if path else os.getcwd()
    try:
        entries = os.listdir(abs_path)
        result = []
        for name in entries:
            full = os.path.join(abs_path, name)
            result.append({
                "name": name,
                "type": "dir" if os.path.isdir(full) else "file",
                "isDirectory": os.path.isdir(full),
            })
        return {"path": abs_path, "entries": result, "count": len(result)}
    except Exception as e:
        raise Exception(f"Failed to list {abs_path}: {e}")

def search_codebase_tool(query: str, pattern: str = "*", cwd: str = "") -> dict:
    import subprocess
    cwd = os.path.abspath(os.path.expanduser(cwd)) if cwd else os.getcwd()
    try:
        escaped_query = query.replace("/", "\\/")
        cmd = f'grep -rn --include="{pattern}" "{escaped_query}" "{cwd}" 2>/dev/null | head -50'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        results = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            parts = line.split(':', 2)
            if len(parts) >= 3:
                results.append({
                    "file": parts[0],
                    "line": int(parts[1]) if parts[1].isdigit() else 0,
                    "text": parts[2]
                })
        return {"query": query, "cwd": cwd, "results": results, "count": len(results)}
    except Exception as e:
        return {"query": query, "cwd": cwd, "results": [], "count": 0, "error": str(e)}

def run_command_tool(command: str, cwd: str = "", timeout: int = 30) -> dict:
    import subprocess
    cwd = os.path.abspath(os.path.expanduser(cwd)) if cwd else os.getcwd()
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            cwd=cwd, timeout=timeout
        )
        return {
            "stdout": result.stdout[:50000],
            "stderr": result.stderr[:10000],
            "exitCode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out", "exitCode": -1}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exitCode": 1}

def get_workspace_tool() -> dict:
    folders = []
    for var in ['TRAE_WORKSPACE', 'WORKSPACE', 'HOME']:
        ws = os.environ.get(var)
        if ws:
            folders.append({"name": os.path.basename(ws), "uri": ws})
            break
    return {
        "folders": folders,
        "root": folders[0]["uri"] if folders else os.getcwd(),
    }

def get_symbols_tool(path: str) -> dict:
    # Basic symbol extraction using grep for function/class definitions
    import subprocess
    abs_path = os.path.abspath(os.path.expanduser(path))
    symbols = []
    try:
        # Python
        result = subprocess.run(
            f'grep -n "^def \\|^class \\|^async def " "{abs_path}" 2>/dev/null',
            shell=True, capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.strip().split('\n'):
            if ':' in line:
                parts = line.split(':', 1)
                symbols.append({
                    "name": parts[1].strip(),
                    "kind": "Function" if parts[1].strip().startswith("def ") else "Class",
                    "location": {"file": abs_path, "line": int(parts[0])}
                })
    except:
        pass
    return {"path": abs_path, "symbols": symbols}

# ─── Tool Registry ─────────────────────────────────────────────────────────────

TOOLS = {
    "read_file": {
        "description": "Read file contents",
        "params": ["path"],
        "fn": lambda params: read_file_tool(params.get("path", "")),
    },
    "write_file": {
        "description": "Write content to a file",
        "params": ["path", "content"],
        "fn": lambda params: write_file_tool(params.get("path", ""), params.get("content", "")),
    },
    "list_dir": {
        "description": "List directory contents",
        "params": ["path"],
        "fn": lambda params: list_dir_tool(params.get("path", "")),
    },
    "search_codebase": {
        "description": "Search for text in files (grep)",
        "params": ["query", "pattern", "cwd"],
        "fn": lambda params: search_codebase_tool(
            params.get("query", ""),
            params.get("pattern", "*"),
            params.get("cwd", ""),
        ),
    },
    "run_command": {
        "description": "Execute a shell command",
        "params": ["command", "cwd", "timeout"],
        "fn": lambda params: run_command_tool(
            params.get("command", ""),
            params.get("cwd", ""),
            params.get("timeout", 30),
        ),
    },
    "get_workspace": {
        "description": "Get workspace folder info",
        "params": [],
        "fn": lambda params: get_workspace_tool(),
    },
    "get_symbols": {
        "description": "Get code symbols from a file",
        "params": ["path"],
        "fn": lambda params: get_symbols_tool(params.get("path", "")),
    },
}

# ─── JSON-RPC Handler ─────────────────────────────────────────────────────────

def handle_request(req: dict) -> dict:
    method = req.get("method", "")
    req_id = req.get("id")
    params = req.get("params", {})

    if method == "ping":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"status": "ok", "tools": list(TOOLS.keys())}
        }

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": [
                    {"name": name, "description": info["description"]}
                    for name, info in TOOLS.items()
                ]
            }
        }

    if method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {}) or {}

        if tool_name not in TOOLS:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32602, "message": f"Unknown tool: {tool_name}"}
            }

        try:
            result = TOOLS[tool_name]["fn"](tool_args)
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {"content": [{"type": "text", "text": json.dumps(result)}]}
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32603, "message": str(e)}
            }

    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"}
    }

# ─── Main Loop ─────────────────────────────────────────────────────────────────

def main():
    buffer = ""
    while True:
        try:
            chunk = sys.stdin.read(1)
            if not chunk:
                break
            buffer += chunk
            if buffer.endswith('\n'):
                line = buffer.strip()
                buffer = ""
                if not line:
                    continue
                try:
                    req = json.loads(line)
                    resp = handle_request(req)
                    sys.stdout.write(json.dumps(resp) + "\n")
                    sys.stdout.flush()
                except json.JSONDecodeError:
                    error_resp = {"jsonrpc": "2.0", "id": 0, "error": {"code": -32700, "message": "Parse error"}}
                    sys.stdout.write(json.dumps(error_resp) + "\n")
                    sys.stdout.flush()
        except EOFError:
            break
        except KeyboardInterrupt:
            break

if __name__ == "__main__":
    main()
