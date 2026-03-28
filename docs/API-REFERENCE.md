# TRAE OpenClaw MCP — API Reference

Complete reference for all MCP tools exposed by the TRAE extension.

**Protocol:** JSON-RPC 2.0 over Unix socket  
**Socket:** `/tmp/trae-openclaw-mcp.sock` (default)  
**Encoding:** UTF-8, newline-delimited messages

---

## Protocol

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { "key": "value" }
  }
}
```

### Response Format (success)

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "content": [
      { "type": "text", "text": "{...json...}" }
    ]
  }
}
```

The `text` field contains the JSON-encoded tool result. Parse it with `json.loads()`.

### Response Format (error)

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32603,
    "message": "Failed to read file: ENOENT: no such file or directory"
  }
}
```

### Special Methods

| Method | Description |
|--------|-------------|
| `ping` | Health check — returns `{"status":"ok","tools":[...]}` |
| `tools/list` | List all available tools |
| `tools/call` | Call a specific tool |

---

## Tool Reference

---

### `get_workspace`

Returns information about the current TRAE workspace.

**Parameters:** none

**Returns:**
```typescript
{
  folders: Array<{
    name: string;
    uri: string;    // absolute file path
  }>;
  root: string | null;   // first workspace folder path
}
```

**Example:**
```python
result = call_tool(sock, "get_workspace")
# {"root": "/home/user/my-project", "folders": [{"name": "my-project", "uri": "/home/user/my-project"}]}
```

---

### `list_dir`

Lists the contents of a directory.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | No | Relative or absolute path. Defaults to workspace root. |

**Returns:**
```typescript
{
  path: string;    // absolute path listed
  entries: Array<{
    name: string;
    type: "file" | "dir";
    isDirectory: boolean;
  }>;
}
```

**Example:**
```python
result = call_tool(sock, "list_dir", {"path": "src"})
# {"path": "/home/user/my-project/src", "entries": [{"name": "index.ts", "type": "file", ...}]}
```

---

### `read_file`

Reads the UTF-8 content of a file.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | **Yes** | File path (relative to workspace or absolute) |

**Returns:**
```typescript
{
  path: string;     // absolute path
  content: string;  // file contents
  size: number;     // byte count
}
```

**Errors:**
- `ENOENT: no such file or directory` — file not found
- `EACCES: permission denied`

**Example:**
```python
result = call_tool(sock, "read_file", {"path": "README.md"})
print(result["content"])
```

---

### `write_file`

Writes content to a file, creating it and parent directories if needed.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | **Yes** | File path (relative or absolute) |
| `content` | string | **Yes** | Content to write (UTF-8) |

**Returns:**
```typescript
{
  path: string;     // absolute path written
  written: true;
  size: number;     // bytes written
}
```

**Notes:**
- Overwrites existing files silently
- Parent directories are created automatically (like `mkdir -p`)

**Example:**
```python
result = call_tool(sock, "write_file", {
    "path": "src/utils/logger.ts",
    "content": "export const log = (...args: unknown[]) => console.log('[KIPP]', ...args);\n"
})
```

---

### `search_codebase`

Searches for text in files using `grep`.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | **Yes** | Search term (passed to grep) |
| `pattern` | string | No | Glob for file matching. Default: `*` |
| `cwd` | string | No | Directory to search in. Default: workspace root |

**Returns:**
```typescript
{
  query: string;
  cwd: string;
  count: number;
  results: Array<{
    file: string;   // absolute file path
    line: number;   // 1-indexed line number
    text: string;   // matching line text
  }>;
}
```

**Notes:**
- Returns up to 50 results
- Uses `grep -rn` (recursive, line numbers)
- Query is passed directly to grep — escape shell special chars if needed

**Examples:**
```python
# Search TypeScript files for TODO
result = call_tool(sock, "search_codebase", {
    "query": "TODO",
    "pattern": "*.ts"
})

# Search for a specific function
result = call_tool(sock, "search_codebase", {
    "query": "function activate",
    "pattern": "*.ts",
    "cwd": "extension/src"
})
```

---

### `run_command`

Executes a shell command and captures output.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | **Yes** | Shell command to run |
| `cwd` | string | No | Working directory. Default: workspace root |
| `timeout` | number | No | Timeout in milliseconds. Default: 30000 |

**Returns:**
```typescript
{
  stdout: string;   // truncated at 50,000 chars
  stderr: string;   // truncated at 10,000 chars
  exitCode: number;
}
```

**Notes:**
- Uses Node.js `child_process.exec` — shell expansion applies
- Non-zero exit codes are returned (not thrown) — check `exitCode`
- Max buffer: 10 MB

**Examples:**
```python
# Git status
result = call_tool(sock, "run_command", {"command": "git status --short"})
print(result["stdout"])

# Run tests
result = call_tool(sock, "run_command", {
    "command": "npm test",
    "cwd": "extension",
    "timeout": 120000
})

# Build check
result = call_tool(sock, "run_command", {"command": "npx tsc --noEmit", "cwd": "extension"})
if result["exitCode"] != 0:
    print("TypeScript errors:", result["stderr"])
```

---

### `open_file`

Opens a file in the TRAE editor, optionally scrolling to a line.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | **Yes** | File path |
| `line` | number | No | Line to navigate to (1-indexed). Default: 1 |

**Returns:**
```typescript
{
  path: string;    // absolute path
  opened: true;
}
```

**Notes:**
- Opens in the first editor column
- Requires TRAE to be running with a visible window

**Example:**
```python
call_tool(sock, "open_file", {"path": "src/auth.ts", "line": 87})
```

---

### `get_symbols`

Returns the symbol tree (functions, classes, variables) for a file, powered by VS Code's language intelligence.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | **Yes** | File path |

**Returns:**
```typescript
{
  path: string;
  symbols: Array<{
    name: string;
    kind: string;          // e.g. "Function", "Class", "Variable", "Method"
    kindNum: number;       // VS Code SymbolKind enum value
    containerName: string; // parent symbol name (if nested)
    location: {
      file: string;
      line: number;        // 1-indexed start line
      endLine: number;     // 1-indexed end line
    };
  }>;
  error?: string;          // set if symbol provider failed
}
```

**Notes:**
- Requires the appropriate language extension to be active (e.g., TypeScript, Python)
- Returns empty array if no language server is available

**Example:**
```python
result = call_tool(sock, "get_symbols", {"path": "extension/src/extension.ts"})
for sym in result["symbols"]:
    print(f"  {sym['kind']:12} {sym['name']} (line {sym['location']['line']})")
```

---

### `get_open_editors`

Lists all open editor tabs in TRAE.

**Parameters:** none

**Returns:**
```typescript
{
  count: number;
  editors: Array<{
    path: string;
    name: string;
    active: boolean;     // is this the active tab?
    visible: boolean;    // is this tab currently visible?
    isDirty: boolean;    // has unsaved changes?
    languageId: string;  // e.g. "typescript", "python", "markdown"
  }>;
  activeEditor: {
    path: string;
    languageId: string;
    lineCount: number;
    selection: {
      startLine: number;
      startChar: number;
      endLine: number;
      endChar: number;
    };
  } | null;
}
```

**Example:**
```python
result = call_tool(sock, "get_open_editors")
print(f"Open tabs: {result['count']}")
for ed in result["editors"]:
    dirty = "●" if ed["isDirty"] else " "
    active = "→" if ed["active"] else " "
    print(f"  {active}{dirty} {ed['name']} ({ed['languageId']})")
```

---

### `run_terminal_command`

Sends a command to the TRAE integrated terminal. Does **not** capture output (use `run_command` for that).

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | **Yes** | Command to send to the terminal |
| `terminalName` | string | No | Terminal name. Creates it if not found. Default: `"TRAE MCP"` |
| `cwd` | string | No | Working directory for new terminals. Default: workspace root |
| `waitMs` | number | No | Milliseconds to wait after sending (max 5000). Default: 3000 |

**Returns:**
```typescript
{
  terminal: string;   // terminal name used
  command: string;    // command sent
  sent: true;
  note: string;       // guidance for capturing output
}
```

**Notes:**
- Use this for long-running commands (servers, watchers) the user wants to see
- For output capture, use `run_command` instead
- To capture: `command: "cmd 2>&1 | tee /tmp/out.txt"` then `read_file /tmp/out.txt`

**Example:**
```python
# Start a dev server
call_tool(sock, "run_terminal_command", {
    "command": "npm run dev",
    "terminalName": "Dev Server"
})

# Run with output capture trick
call_tool(sock, "run_terminal_command", {
    "command": "npm run build 2>&1 | tee /tmp/build.log",
    "terminalName": "Build"
})
import time; time.sleep(10)  # wait for build
output = call_tool(sock, "read_file", {"path": "/tmp/build.log"})
```

---

### `get_terminal_output`

Returns output from a terminal session (if a log file is available) or info about open terminals.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `terminalName` | string | No | Terminal to check. Default: `"TRAE MCP"` |
| `lines` | number | No | Last N lines to return. Default: 50 |

**Returns (when log file exists):**
```typescript
{
  terminal: string;
  output: string;     // last N lines
  lineCount: number;
  source: "file";
  filePath: string;
}
```

**Returns (when no log file):**
```typescript
{
  terminal: string;
  output: null;
  terminals: Array<{ name: string }>;
  note: string;       // guidance
  suggestion: string;
}
```

**Notes:**
- VS Code doesn't expose terminal stdout directly
- Output is only available if a `tee` redirect was used (see `run_terminal_command`)

---

### `invoke_solo_agent`

Delegates a coding task to TRAE's built-in SOLO AI agent.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | **Yes** | Natural language task description |

**Returns:**
```typescript
// Success
{
  success: true;
  mode: "solo" | "solo_fallback";
  result?: unknown;   // VS Code command result (may be undefined)
}

// Failure
{
  success: false;
  mode: "solo";
  instruction: string;    // the task that was sent
  error: string;
  hint: string;           // how to resolve manually
}
```

**Notes:**
- Requires TRAE's AI chat panel to be visible
- SOLO mode toggle happens automatically
- May fail if TRAE's internal command IDs have changed between versions
- As a fallback, use file tools directly

**Example:**
```python
result = call_tool(sock, "invoke_solo_agent", {
    "task": """
    In extension/src/extension.ts:
    1. Add JSDoc comments to all exported functions
    2. Make sure TypeScript strict mode is satisfied
    3. Run npm run compile to verify
    """
})
if result.get("success"):
    print("SOLO is working on it!")
else:
    print("SOLO unavailable:", result.get("hint"))
```

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| `-32700` | Parse Error | Invalid JSON in request |
| `-32600` | Invalid Request | Missing `jsonrpc`, `id`, or `method` |
| `-32601` | Method Not Found | Unknown `method` value |
| `-32602` | Invalid Params | Tool not found, or missing required param |
| `-32603` | Internal Error | Tool execution threw an error |

---

## Python Quick Reference

```python
from mcp_client import connect, call_tool, send_rpc

# Connect
sock = connect()                            # auto-retries

# List tools
resp = send_rpc(sock, "tools/list")
tools = [t["name"] for t in resp["result"]["tools"]]

# Ping
resp = send_rpc(sock, "ping")               # {"status":"ok",...}

# Call any tool
result = call_tool(sock, "tool_name", {"param": "value"})

# Error handling
try:
    result = call_tool(sock, "read_file", {"path": "missing.ts"})
except RuntimeError as e:
    print(f"Tool error: {e}")

# Clean up
sock.close()
```

---

## Shell Quick Reference

```bash
# Ping
python3 mcp_client.py ping

# List tools
python3 mcp_client.py tools/list

# Call a tool (shortcut)
python3 mcp_client.py call get_workspace
python3 mcp_client.py call read_file '{"path":"README.md"}'
python3 mcp_client.py call list_dir '{"path":"src"}'
python3 mcp_client.py call run_command '{"command":"git log --oneline -5"}'
python3 mcp_client.py call get_open_editors
python3 mcp_client.py call search_codebase '{"query":"TODO","pattern":"*.ts"}'
python3 mcp_client.py call invoke_solo_agent '{"task":"Add comments to auth.ts"}'

# Interactive REPL
python3 mcp_client.py repl

# Full test
python3 test_workflow.py

# Custom socket
TRAE_MCP_SOCK=/tmp/custom.sock python3 mcp_client.py ping
```
