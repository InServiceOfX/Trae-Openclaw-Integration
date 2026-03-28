# SKILL.md — TRAE OpenClaw MCP Integration (Copy to your workspace)

> **⚠️ NOTE:** This is an **example** skill file. Copy its contents to your actual OpenClaw
> workspace at `~/.openclaw/workspace/<your-skill-name>/SKILL.md` and customize the paths.

**Skill Name:** `trae-mcp`  
**Purpose:** Connect OpenClaw to TRAE IDE via Unix socket MCP  
**Socket:** `/tmp/trae-openclaw-mcp.sock`

---

## Connection

The MCP server is a VS Code extension running inside TRAE. It auto-starts when TRAE launches
and the "TRAE MCP: Start Server" command is run.

**Test connection:**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}' | nc -U /tmp/trae-openclaw-mcp.sock -w 2
```

---

## Tool Reference

| Tool | What it does |
|------|-------------|
| `start_solo_mode` | Toggle TRAE SOLO mode on/off |
| `send_to_solo_chat` | Paste text into SOLO chat (then press Enter) |
| `list_mcp_servers` | List all MCP servers in TRAE config |
| `add_mcp_server` | Add an MCP server to TRAE's mcp.json |
| `open_mcp_config` | Open TRAE MCP settings UI |
| `read_file` | Read file contents |
| `write_file` | Create/overwrite a file |
| `list_dir` | List directory entries |
| `search_codebase` | Grep search files |
| `run_command` | Execute shell command |
| `open_file` | Open file in TRAE editor at line |
| `get_symbols` | Get code symbols (functions, classes) |
| `get_workspace` | Get workspace folder paths |
| `get_open_editors` | List open editor tabs |
| `run_terminal_command` | Send command to TRAE terminal |
| `get_terminal_output` | Read terminal output |

---

## Usage Examples

**Toggle SOLO mode:**
```
Tool: start_solo_mode
```

**Send a task to SOLO chat:**
```
Tool: send_to_solo_chat
Params: {"text": "Create a hello world Python script"}
```

**List MCP servers:**
```
Tool: list_mcp_servers
```

**Read a file:**
```
Tool: read_file
Params: {"path": "/path/to/file.py"}
```

**Write a file:**
```
Tool: write_file
Params: {"path": "/path/to/file.py", "content": "print('hello')"}
```

**Search codebase:**
```
Tool: search_codebase
Params: {"query": "function_name", "pattern": "*.py"}
```

---

## Python MCP Client

```python
import socket, json

SOCKET = "/tmp/trae-openclaw-mcp.sock"

def call_tool(name, args=None):
    req = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
           "params": {"name": name, "arguments": args or {}}}
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(SOCKET)
    sock.sendall((json.dumps(req) + "\n").encode())
    resp = b""
    while True:
        ch = sock.recv(4096)
        if not ch: break
        resp += ch
        try: return json.loads(resp.decode())
        except: continue
    return None
```

---

## Customization for Your Setup

1. **Socket path:** If you changed the socket path in the extension config, update `SOCKET` above
2. **Workspace path:** The MCP server resolves relative paths from the TRAE workspace root
3. **MCP servers:** Edit `~/.config/Trae/User/mcp.json` to add more MCP servers

---

*Copy this file to your workspace and rename it appropriately.*
