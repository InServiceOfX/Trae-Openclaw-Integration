# SKILL.md — TRAE OpenClaw MCP Integration

## Overview

This skill lets KIPP (OpenClaw) orchestrate the TRAE IDE by connecting to a TRAE extension that exposes an MCP server over a Unix socket.

**Architecture:**
```
KIPP (OpenClaw)  →  MCP Client  →  Unix Socket  →  TRAE Extension (MCP Server)
                                              ↓
                                    VS Code / TRAE API
                                              ↓
                                    TRAE SOLO Agent (Rust)
```

**Prerequisite:** The `trae-openclaw-mcp` VS Code extension must be installed and activated in TRAE.

## Connection

- **Socket:** `/tmp/trae-openclaw-mcp.sock` (configurable in TRAE settings)
- **Protocol:** JSON-RPC 2.0 over TCP/Unix socket
- **Port fallback:** `9191` TCP

## Available Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `read_file` | Read file contents | `path` (string) |
| `write_file` | Write/create a file | `path`, `content` (strings) |
| `list_dir` | List directory entries | `path` (optional, defaults to workspace root) |
| `search_codebase` | Grep search across files | `query`, `pattern` (glob), `cwd` |
| `run_command` | Execute shell command | `command`, `cwd` (optional), `timeout` (ms) |
| `open_file` | Open a file in the TRAE editor | `path`, `line` (optional) |
| `get_workspace` | Get workspace folder info | none |
| `get_symbols` | Get code symbols (functions, classes) | `path` |
| `invoke_solo_agent` | Delegate a task to the TRAE SOLO agent | `task` (string) |

## Tool Use Guidelines

### When to use each tool

- **`read_file`** — Read source code files before editing or reviewing
- **`write_file`** — Create or modify code files in the workspace
- **`list_dir`** — Explore project structure
- **`search_codebase`** — Find usages, search for patterns before refactoring
- **`run_command`** — Execute build scripts, git commands, tests
- **`open_file`** — Open a file in TRAE for the user to see/interact with
- **`get_workspace`** — Always check this first to know the workspace root
- **`get_symbols`** — Understand the structure of a file before editing
- **`invoke_solo_agent`** — Delegate complex coding tasks to TRAE's SOLO agent

### Workflow

1. **Connect** — The skill auto-connects to the socket on first tool call
2. **Ping** — Verify connection with a ping
3. **Delegate** — Send tasks to TRAE via tools
4. **Read results** — Read output files, get updated code

## Configuration

```yaml
# In openclaw.json providers section
providers:
  trae-mcp:
    type: socket
    socketPath: /tmp/trae-openclaw-mcp.sock
```

## Notes

- The `invoke_solo_agent` tool may return `{ success: false }` if the SOLO agent is not in the correct mode
- File paths are relative to the TRAE workspace root unless absolute
- `search_codebase` returns max 50 results per query
- The socket must be manually started in TRAE via command "TRAE MCP: Start Server" (or auto-starts on extension activation)

## Troubleshooting

**Connection refused:**
1. Open TRAE IDE
2. Run command "TRAE MCP: Start Server" (Ctrl+Shift+P → "TRAE MCP: Start Server")
3. Verify socket exists: `ls -la /tmp/trae-openclaw-mcp.sock`

**SOLO agent not responding:**
- The SOLO agent runs as a separate Rust subprocess
- In IDE mode, use file-based tools instead of `invoke_solo_agent`
- In SOLO mode, the agent may need to be started manually
