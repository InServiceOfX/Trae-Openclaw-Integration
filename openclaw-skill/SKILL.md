# SKILL.md — TRAE OpenClaw MCP Integration

**Purpose:** Connect an OpenClaw agent to TRAE IDE over a Unix socket using the MCP protocol, enabling file operations, code search, terminal commands, and delegating tasks to TRAE's AI agent (SOLO).

---

## How Users Talk to the Agent (Voice Commands)

```
# IDE Mode — agent uses file tools directly in TRAE
"In TRAE, IDE mode, create a new Python file called hello.py"
"In TRAE, open the file src/app.ts and find the bug"
"In TRAE, search for all usages of login function"
"In TRAE, IDE, create a test file for auth.py"

# SOLO Mode — agent delegates to TRAE's SOLO agent via chat
"In TRAE, SOLO Builder mode, build a REST API"
"In TRAE, SOLO Coder mode, fix the login bug in auth.ts"
"In TRAE, SOLO Builder, create a Flask todo app"
"In TRAE, SOLO mode, add user authentication to the app"

# SOLO + clipboard paste (agent pastes, user presses Enter)
"In TRAE, SOLO Builder, create a microservices architecture diagram"

# MCP Management
"List the MCP servers in TRAE"
"Add the GitHub MCP to TRAE"
"Open the MCP settings in TRAE"

# Mode switching
"Switch to SOLO mode in TRAE"
"Switch back to IDE mode in TRAE"
```

---

## Architecture

```
OpenClaw Agent  →  mcp_client.py  →  /tmp/trae-openclaw-mcp.sock  →  TRAE Extension  →  VS Code API
                                                                                        ↓
                                                                                  TRAE SOLO Agent
```

- **Protocol:** JSON-RPC 2.0 over Unix domain socket
- **Socket path:** `/tmp/trae-openclaw-mcp.sock` (default, configurable)
- **Extension:** `trae-openclaw-mcp` VS Code extension (in `extension/` folder)

---

## Prerequisite: Start the Server

The TRAE extension must be running. It auto-starts on activation. To manually start:

1. Open TRAE IDE (based on VS Code)
2. Press `Ctrl+Shift+P` → type `TRAE MCP: Start Server` → Enter
3. Verify: `ls -la /tmp/trae-openclaw-mcp.sock`

---

## Connection: Python

Use `mcp_client.py` from the repo root.

```python
from mcp_client import connect, call_tool, send_rpc

# Connect (retries automatically if socket not ready)
sock = connect()

# Call any tool
result = call_tool(sock, "get_workspace")
print(result["root"])  # → /home/ernest/my-project

# Clean up
sock.close()
```

### Connection with reconnect logic

```python
from mcp_client import connect, call_tool, SOCKET_PATH
import time

for attempt in range(5):
    try:
        sock = connect(SOCKET_PATH, retries=3)
        break
    except ConnectionError:
        print(f"Retry {attempt+1}...")
        time.sleep(2)
```

---

## Available Tools

| Tool | Description | Key Params |
|------|-------------|------------|
| `get_workspace` | Get workspace folder info | — |
| `list_dir` | List directory entries | `path` (opt) |
| `read_file` | Read file contents | `path` |
| `write_file` | Write/create a file | `path`, `content` |
| `search_codebase` | Grep search across files | `query`, `pattern` (glob), `cwd` |
| `run_command` | Execute shell command (captures stdout) | `command`, `cwd`, `timeout` |
| `open_file` | Open file in TRAE editor | `path`, `line` (opt) |
| `get_symbols` | Get code symbols (functions, classes) | `path` |
| `get_open_editors` | List currently open files in TRAE | — |
| `run_terminal_command` | Send command to TRAE terminal | `command`, `terminalName`, `waitMs` |
| `get_terminal_output` | Get info about terminal / output file | `terminalName`, `lines` |
| `invoke_solo_agent` | Delegate task to TRAE SOLO agent | `task` |
| `start_solo_mode` | Toggle TRAE SOLO mode on/off | — |
| `send_to_solo_chat` | Type text into SOLO chat (clipboard paste) | `text` |
| `open_mcp_config` | Open TRAE MCP settings UI | `scope` (opt) |
| `list_mcp_servers` | List all TRAE MCP servers (User + Global) | — |
| `add_mcp_server` | Add an MCP server to TRAE config | `name`, `command`, `args` |
| `call_mcp_server` | Call any TRAE MCP server's tool directly | `server`, `tool`, `arguments` |

---

## How to Call Each Tool

### `get_workspace`

```python
result = call_tool(sock, "get_workspace")
# result = {"root": "/path/to/project", "folders": [{"name": "my-project", "uri": "/path/..."}]}
```

**Trigger:** *"What's the workspace root?"*, *"Show me the project directory"*

---

### `list_dir`

```python
# List workspace root
result = call_tool(sock, "list_dir", {})

# List specific subdirectory
result = call_tool(sock, "list_dir", {"path": "src"})

# result = {"path": "/abs/path", "entries": [{"name": "index.ts", "type": "file", "isDirectory": false}, ...]}
```

**Trigger:** *"What files are in the src folder?"*, *"Show me the project structure"*

---

### `read_file`

```python
result = call_tool(sock, "read_file", {"path": "src/index.ts"})
content = result["content"]  # full file text
size    = result["size"]     # byte count
```

**Trigger:** *"Read extension.ts"*, *"Show me the contents of README.md"*

---

### `write_file`

```python
result = call_tool(sock, "write_file", {
    "path": "src/utils/helper.ts",
    "content": "export function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n"
})
# result = {"path": "/abs/path", "written": true, "size": 67}
```

**Trigger:** *"Create a new file called helper.ts"*, *"Write this code to utils.py"*

---

### `search_codebase`

```python
# Search TypeScript files for "TODO"
result = call_tool(sock, "search_codebase", {
    "query": "TODO",
    "pattern": "*.ts"
})

# Search Python files
result = call_tool(sock, "search_codebase", {
    "query": "def connect",
    "pattern": "*.py"
})

# result = {"query": "...", "results": [{"file": "/abs/path", "line": 42, "text": "// TODO: fix this"}], "count": 3}
```

**Trigger:** *"Find all TODOs in the codebase"*, *"Search for usages of the connect function"*

---

### `run_command`

```python
# Run a shell command with captured output
result = call_tool(sock, "run_command", {
    "command": "git log --oneline -5"
})
stdout  = result["stdout"]
stderr  = result["stderr"]
exit_code = result["exitCode"]

# Run tests
result = call_tool(sock, "run_command", {
    "command": "npm test",
    "cwd": "extension",
    "timeout": 60000
})
```

**Trigger:** *"Run the tests"*, *"What's the git status?"*, *"Build the project"*

---

### `open_file`

```python
# Open file in TRAE editor (shows it to the user)
result = call_tool(sock, "open_file", {"path": "src/extension.ts", "line": 42})
# result = {"path": "/abs/path", "opened": true}
```

**Trigger:** *"Open extension.ts in the editor"*, *"Show me line 100 of auth.ts"*

---

### `get_symbols`

```python
result = call_tool(sock, "get_symbols", {"path": "extension/src/extension.ts"})
symbols = result["symbols"]
# symbols = [{"name": "activate", "kind": "Function", "location": {"line": 200, "endLine": 230}}, ...]
```

**Trigger:** *"What functions are in extension.ts?"*, *"Show me the class structure of auth.py"*

---

### `get_open_editors`

```python
result = call_tool(sock, "get_open_editors")
editors = result["editors"]     # list of all open tabs
active  = result["activeEditor"]  # currently active editor

# editors[0] = {"path": "/abs/path", "name": "extension.ts", "active": true, "visible": true, "isDirty": false, "languageId": "typescript"}
```

**Trigger:** *"What files are open in TRAE?"*, *"Which tab is active?"*

---

### `run_terminal_command`

```python
# Send a command to the TRAE terminal (non-blocking, no stdout capture)
result = call_tool(sock, "run_terminal_command", {
    "command": "npm run watch",
    "terminalName": "Build Watcher"
})
# result = {"terminal": "Build Watcher", "command": "npm run watch", "sent": true, ...}

# Capture output by redirecting to a file, then reading it
call_tool(sock, "run_terminal_command", {
    "command": "ls -la 2>&1 | tee /tmp/ls-output.txt",
    "terminalName": "TRAE MCP"
})
# then:
result = call_tool(sock, "read_file", {"path": "/tmp/ls-output.txt"})
```

**Trigger:** *"Start the dev server in the terminal"*, *"Run npm watch in a background terminal"*

> **Note:** Use `run_command` when you need to capture stdout. Use `run_terminal_command` for interactive/long-running commands you want the user to see.

---

### `get_terminal_output`

```python
result = call_tool(sock, "get_terminal_output", {
    "terminalName": "TRAE MCP",
    "lines": 100
})
# If a /tmp output file exists, returns its content
# Otherwise returns guidance and open terminal list
```

---

### `invoke_solo_agent`

```python
result = call_tool(sock, "invoke_solo_agent", {
    "task": "Add TypeScript types to all functions in src/utils.ts and run the linter"
})
# result = {"success": true, "mode": "solo"} or {"success": false, "error": "..."}
```

**Trigger:** *"Ask TRAE to refactor this code"*, *"Have TRAE SOLO add error handling to auth.ts"*

> **Note:** SOLO agent may return `success: false` if it's not in the correct mode. Use file tools as a fallback.

---

## Workflow: Delegating a Coding Task to TRAE

Here's the complete workflow the agent should follow when the user says *"Have TRAE fix the login bug in auth.ts"*:

```python
from mcp_client import connect, call_tool

sock = connect()

# 1. Understand the workspace
workspace = call_tool(sock, "get_workspace")
root = workspace["root"]
print(f"Working in: {root}")

# 2. Read the relevant file
code = call_tool(sock, "read_file", {"path": "src/auth.ts"})
print(f"Auth.ts ({code['size']} bytes)")

# 3. Search for the bug pattern
hits = call_tool(sock, "search_codebase", {"query": "login", "pattern": "*.ts"})
print(f"Found {hits['count']} references to 'login'")

# 4. Get symbols to understand structure
symbols = call_tool(sock, "get_symbols", {"path": "src/auth.ts"})
fn_names = [s["name"] for s in symbols["symbols"]]
print(f"Functions: {fn_names}")

# 5. Open the file so the user can see it
call_tool(sock, "open_file", {"path": "src/auth.ts"})

# 6. Delegate to TRAE SOLO
result = call_tool(sock, "invoke_solo_agent", {
    "task": f"Fix the login bug in src/auth.ts. The issue is in the {fn_names} functions. Make sure to handle null/undefined credentials and add proper error messages."
})

if result.get("success"):
    print("SOLO agent is working on it!")
else:
    # Fallback: the agent handles it directly
    print("SOLO unavailable, fixing manually...")
    fixed_content = code["content"].replace("/* TODO: fix */" , "// fixed by the agent")
    call_tool(sock, "write_file", {"path": "src/auth.ts", "content": fixed_content})

sock.close()
```

### `start_solo_mode`

Toggle TRAE SOLO mode on or off. Use this to activate SOLO before delegating tasks.

```python
result = call_tool(sock, "start_solo_mode")
# result = {"success": true, "action": "solo_mode_toggled"}
```

**Trigger:** *"Activate SOLO mode in TRAE"*, *"Switch to SOLO builder"*

### `send_to_solo_chat`

Type text into the SOLO chat input using clipboard paste. The text is copied to clipboard, pasted into the SOLO chat input (Ctrl+V), and the chat panel is focused.

```python
result = call_tool(sock, "send_to_solo_chat", {
    "text": "Create a Python script that prints hello world"
})
# result = {"success": true, "action": "text_pasted", "note": "Text pasted. Press Enter to send."}
```

**Note:** After pasting, the user or the SOLO agent must press Enter to send the message.

**Trigger:** *"Type into SOLO chat: create a hello world script"*, *"Ask SOLO to build a REST API"*

### `open_mcp_config`

Open the TRAE MCP configuration in the settings UI.

```python
# Open user-level MCP settings
result = call_tool(sock, "open_mcp_config")
# result = {"success": true, "action": "mcp_config_opened", "scope": "user"}

# Open workspace-level MCP settings
result = call_tool(sock, "open_mcp_config", {"scope": "workspaceFolder"})
```

**Trigger:** *"Open MCP settings in TRAE"*, *"Show me the MCP server configuration"*

### `list_mcp_servers`

List all MCP servers configured in TRAE's `mcp.json`.

```python
result = call_tool(sock, "list_mcp_servers")
# result = {"configPath": "/home/ernest/.config/Trae/mcp.json", "servers": [{"name": "trae-openclaw", "config": {...}}]}
```

**Trigger:** *"What MCP servers are configured in TRAE?"*, *"Show me TRAE's MCP setup"*

### `add_mcp_server`

Register a new MCP server in TRAE's `mcp.json`. Requires a TRAE reload to take effect.

```python
result = call_tool(sock, "add_mcp_server", {
    "name": "my-mcp-server",
    "command": "python3",
    "args": ["/path/to/mcp_server.py"]
})
# After adding, must reload TRAE: Ctrl+Shift+P → Developer: Reload Window
```

**Trigger:** *"Add a new MCP server to TRAE"*, *"Register our integration MCP server in TRAE"*

---

### `call_mcp_server`

Call any MCP server that TRAE has configured (memory, github, docker, etc.)
OpenClaw uses this to route MCP tool calls through TRAE's MCP infrastructure.

```python
# List GitHub repos via TRAE's GitHub MCP server
result = call_tool(sock, "call_mcp_server", {
    "server": "github",
    "tool": "search_repositories",
    "arguments": {"query": "user:InServiceOfX", "perPage": 5}
})
# Returns: {success: true, server: "github", response: {result: {content: [...]}}}

# Read memory MCP store
result = call_tool(sock, "call_mcp_server", {
    "server": "memory",
    "tool": "memory_search",
    "arguments": {"query": "project ideas"}
})

# Get available tools from any MCP server
result = call_tool(sock, "call_mcp_server", {
    "server": "github",
    "method": "tools/list"
})
```

**Trigger:** *"Search GitHub repos via TRAE MCP"*, *"Query memory MCP for project notes"*, *"Call docker MCP to list containers"*

---

## Interactive Testing: REPL Mode

```bash
# Start the interactive REPL
python3 mcp_client.py repl

# Inside the REPL:
mcp> ping
mcp> tools
mcp> get_workspace
mcp> list_dir {"path": "src"}
mcp> read_file {"path": "README.md"}
mcp> search_codebase {"query": "TODO", "pattern": "*.ts"}
mcp> run_command {"command": "git status"}
mcp> get_open_editors
mcp> invoke_solo_agent {"task": "Add a README section about the MCP integration"}
```

---

## One-Shot CLI Usage

```bash
# Ping
python3 mcp_client.py ping

# List tools
python3 mcp_client.py tools/list

# Call a tool (shortcut)
python3 mcp_client.py call get_workspace
python3 mcp_client.py call list_dir '{"path": "src"}'
python3 mcp_client.py call read_file '{"path": "README.md"}'
python3 mcp_client.py call run_command '{"command": "git log --oneline -5"}'

# Raw JSON-RPC
python3 mcp_client.py tools/call '{"name":"search_codebase","arguments":{"query":"TODO","pattern":"*.ts"}}'
```

---

## Full Workflow Test

```bash
python3 test_workflow.py
```

This test script:
1. Connects and pings
2. Lists tools
3. Gets workspace info
4. Lists workspace root
5. Creates `openclaw-test-output.txt`
6. Searches for content in that file
7. Reads the file back
8. Runs a shell command

---

## Configuration

Override socket path:
```bash
TRAE_MCP_SOCK=/custom/path.sock python3 mcp_client.py repl
```

Or in Python:
```python
import os
os.environ["TRAE_MCP_SOCK"] = "/custom/path.sock"
from mcp_client import connect
sock = connect()
```

---

## Troubleshooting

**Socket not found / Connection refused:**
1. Open TRAE IDE
2. `Ctrl+Shift+P` → `TRAE MCP: Start Server`
3. Check: `ls -la /tmp/trae-openclaw-mcp.sock`

**Tool returns error:**
- Check params — all required params must be present
- File paths can be relative (to workspace root) or absolute

**SOLO agent `success: false`:**
- TRAE's SOLO mode may need to be toggled manually
- Use file read/write tools directly as an alternative
- Check TRAE's AI chat panel is visible

**`invoke_solo_agent` has no effect:**
- The SOLO agent's VS Code command IDs (`icube.ai-chat.*`) may differ between TRAE versions
- Fall back to direct file manipulation with `write_file`
