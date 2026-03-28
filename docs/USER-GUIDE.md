# TRAE OpenClaw Integration — User Guide

This guide explains how to use the TRAE ↔ OpenClaw integration to let any OpenClaw agent control and interact with the TRAE IDE.

---

## What Is This?

The TRAE OpenClaw Integration bridges your OpenClaw AI assistant with TRAE IDE. The agent can:

- Read and write files in your TRAE workspace
- Search through your codebase
- Run shell commands and see their output
- Open files in the TRAE editor
- See which files you have open
- Send commands to the TRAE integrated terminal
- Delegate complex coding tasks to TRAE's built-in SOLO AI agent

---

## Quick Start

### 1. Install the TRAE Extension

The extension is in the `extension/` folder of this repo.

```bash
# Build the extension
cd extension
npm install
npm run compile   # or: npx tsc

# Package it
npx vsce package

# Install in TRAE
code --install-extension trae-openclaw-mcp-*.vsix
# (replace 'code' with your TRAE executable if different)
```

### 2. Start TRAE and Activate the Extension

1. Open TRAE IDE
2. The MCP server starts automatically when the extension activates
3. You'll see `$(radio-tower) MCP: /tmp/trae-openclaw-mcp.sock` in the status bar
4. If it doesn't auto-start: `Ctrl+Shift+P` → **TRAE MCP: Start Server**

### 3. Tell the agent to Use TRAE

In OpenClaw chat, say:
- *"Connect to TRAE and show me the workspace"*
- *"What files are in my TRAE project?"*
- *"Ask TRAE to fix the bug in auth.ts"*

the agent will use the `mcp_client.py` script and the skill in `openclaw-skill/SKILL.md` to interact with TRAE.

---

## Usage Scenarios

### Browse Your Project

> "What's the structure of the project in TRAE?"

the agent will call `get_workspace` and `list_dir` to explore your workspace and describe what it finds.

### Read a File

> "Show me the contents of src/extension.ts"

the agent will call `read_file` and display the file content to you.

### Write / Edit a File

> "Create a new file called src/utils/logger.ts with a simple logging utility"

the agent will write the file using `write_file`. It will tell you the path and confirm it was written.

### Search the Codebase

> "Find all TODO comments in TypeScript files"

the agent uses `search_codebase` to grep through files and show you the results with file names and line numbers.

### Run a Command

> "Run the test suite and show me if anything's failing"

the agent calls `run_command` which captures stdout and stderr. You'll see the full output.

### Open a File in TRAE

> "Open src/auth.ts at line 42 in the editor"

the agent calls `open_file` which actually navigates the TRAE editor to that file and line — so you can see it immediately.

### See What's Open

> "What files do I have open in TRAE right now?"

the agent calls `get_open_editors` and shows you all open tabs with their dirty/clean status.

### Use the TRAE Terminal

> "Start the webpack dev server in the TRAE terminal"

the agent sends the command to the TRAE integrated terminal with `run_terminal_command`. The terminal stays open so you can interact with it.

### Delegate to TRAE SOLO Agent

> "Have TRAE SOLO refactor the login function in auth.ts to use async/await"

the agent calls `invoke_solo_agent` with a task description. TRAE's built-in AI agent takes over and performs the task in the IDE.

---

## Configuration

### Extension Settings

In TRAE, go to **Settings** → search for `traeOpenclawMcp`:

| Setting | Default | Description |
|---------|---------|-------------|
| `traeOpenclawMcp.socketPath` | `/tmp/trae-openclaw-mcp.sock` | Unix socket path |

### Environment Variable

You can override the socket path for the Python client:

```bash
export TRAE_MCP_SOCK=/custom/path/trae.sock
```

---

## Testing the Connection

### Quick check (no socket needed)

```bash
ls -la /tmp/trae-openclaw-mcp.sock
```

### Ping test

```bash
python3 mcp_client.py ping
```

Expected output:
```json
{
  "jsonrpc": "2.0",
  "id": "...",
  "result": {
    "status": "ok",
    "tools": ["read_file", "write_file", "list_dir", ...]
  }
}
```

### Interactive REPL

```bash
python3 mcp_client.py repl
```

Then try commands:
```
mcp> ping
mcp> tools
mcp> get_workspace
mcp> list_dir
```

### Full Integration Test

```bash
python3 test_workflow.py
```

This runs a complete test: connect → ping → list → write → search → read → cleanup.

---

## Commands (in TRAE)

| Command (Ctrl+Shift+P) | Description |
|------------------------|-------------|
| `TRAE MCP: Start Server` | Start the MCP socket server |
| `TRAE MCP: Stop Server` | Stop the server and remove socket |
| `TRAE MCP: Status` | Show server status and available tools |
| `TRAE MCP: Run Task` | Open an input box to send a task to SOLO agent |

---

## Status Bar

The status bar shows the current state:
- 🟢 `$(radio-tower) MCP: /tmp/trae-openclaw-mcp.sock` — running
- 🔴 `$(circle-slash) MCP: off` — stopped

Click the status bar item to see the current status and tool list.

---

## How It Works (Technical)

1. **TRAE Extension** listens on a Unix socket (`/tmp/trae-openclaw-mcp.sock`)
2. Each connection gets a newline-delimited JSON-RPC 2.0 stream
3. the agent sends requests via `mcp_client.py`'s `call_tool()` function
4. The extension executes the tool (VS Code API, shell commands, file I/O)
5. Results return as JSON-RPC responses

```
OpenClaw chat message
    ↓
OpenClaw reads SKILL.md
    ↓
Python: sock = connect(); result = call_tool(sock, "read_file", {"path": "..."})
    ↓
JSON-RPC over Unix socket
    ↓
TRAE extension: TOOLS["read_file"](params) → fs.readFile(...)
    ↓
Response: {"jsonrpc":"2.0","result":{"content":[{"type":"text","text":"..."}]}}
    ↓
the agent presents result to user
```

---

## Troubleshooting

### "Socket not found"

The TRAE extension isn't running or hasn't started the server.

1. Open TRAE
2. `Ctrl+Shift+P` → `TRAE MCP: Start Server`
3. Check status bar — should turn green

### "Connection refused"

The socket file exists but nothing is listening (stale socket).

```bash
rm /tmp/trae-openclaw-mcp.sock
# Then restart the server in TRAE
```

### "Unknown tool" error

The extension version may be older. Check which tools are available:

```bash
python3 mcp_client.py tools/list
```

### SOLO agent not working

The `invoke_solo_agent` tool requires TRAE's AI chat panel. If it fails:
- Use file tools directly (`read_file`, `write_file`)
- Or use `run_command` to run scripts manually

### Extension not loading in TRAE

- Make sure you've compiled TypeScript: `cd extension && npm run compile`
- Check TRAE's Extension panel for error messages
- Try reloading: `Ctrl+Shift+P` → `Developer: Reload Window`
