# TRAE OpenClaw Integration — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  KIPP (OpenClaw)                                                │
│                                                                 │
│  ┌──────────────────┐      ┌─────────────────────┐             │
│  │ MCP Client Skill │─────▶│ Unix Socket          │             │
│  │ (Python/node)    │      │ /tmp/trae-mcp.sock  │             │
│  └──────────────────┘      └──────────┬──────────┘             │
│                                       │                        │
│                                       ▼                        │
│                           ┌───────────────────────┐           │
│                           │ TRAE Extension (MCP)   │           │
│                           │ extension.ts           │           │
│                           │ - JSON-RPC over socket │           │
│                           │ - VS Code API access   │           │
│                           └───────────┬───────────┘           │
│                                       │                       │
│                          ┌────────────┴───────────┐           │
│                          │                         │           │
│                          ▼                         ▼           │
│               ┌──────────────────┐    ┌──────────────────┐    │
│               │ VS Code API      │    │ VS Code Commands │    │
│               │ (workspace,      │    │ (icube.solo,    │    │
│               │  documents,      │    │  agent tasks)   │    │
│               │  terminals)      │    └────────┬─────────┘    │
│               └──────────────────┘              │              │
│                                                ▼              │
│                                   ┌─────────────────────┐    │
│                                   │ NativeExtensionSvc   │    │
│                                   │ (ai_agent Rust)     │    │
│                                   │ - AHA-IPC FFI        │    │
│                                   │ - chat.create_session│    │
│                                   │ - agent.get_agents   │    │
│                                   └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### `extension/` — TRAE MCP Server Extension

Sits inside the TRAE IDE. Exposes a JSON-RPC interface over a Unix socket.

**Socket:** `/tmp/trae-openclaw-mcp.sock`

**Protocol:** JSON-RPC 2.0, one request per line, one response per line.

**Available tools:**
- `read_file` — Read any file in the workspace
- `write_file` — Create or overwrite files
- `list_dir` — Directory listing with type info
- `search_codebase` — Grep search with file:line:text output
- `run_command` — Execute shell commands with timeout
- `open_file` — Open file at specific line in editor
- `get_workspace` — Get workspace folder info
- `get_symbols` — VS Code document symbol provider (functions, classes)
- `invoke_solo_agent` — Delegate to TRAE SOLO agent (best-effort)

### `openclaw-skill/` — OpenClaw MCP Client Skill

KIPP's skill that connects to the extension's Unix socket and calls tools.

## MCP Protocol

### Connection
```bash
nc -U /tmp/trae-openclaw-mcp.sock
```

### Request Format
```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_workspace","arguments":{}}}
```

### Response Format
```json
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"folders\":[...]"}]}}
```

### Methods
- `ping` → returns server status and tool list
- `tools/list` → lists available tool names
- `tools/call` → calls a specific tool with parameters

### Error Codes
- `-32700` — Parse error
- `-32602` — Invalid params (unknown tool)
- `-32603` — Internal tool error
- `-32601` — Method not found

## SOLO Agent Integration

The SOLO agent is a ByteDance `ai_agent` Rust process running as Electron's NativeExtensionService. Key services:

- `chat.create_session` — creates a new agent session
- `chat.get_messages` — retrieves session messages  
- `agent.get_agents` — lists available agent types (solo_coder, solo_builder)

Integration is **best-effort** — `invoke_solo_agent` tries `vscode.commands.executeCommand('icube.solo.executeTask', { task })` and falls back to a manual instruction if unavailable.

## Security Notes

- Socket mode: `0700` (user-only)
- File operations are sandboxed to workspace folder
- `run_command` has a 30-second timeout and 10MB output cap
- TRAE's agent sandbox whitelist enforced by the agent itself
