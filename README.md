# TRAE OpenClaw Integration

Bridge between [OpenClaw](https://github.com/openclaw/openclaw) and [TRAE IDE](https://www.trae.ai/) — enables OpenClaw to orchestrate TRAE as an AI coding agent.

**What it does:** KIPP (OpenClaw) connects to a TRAE extension that exposes an MCP server, allowing KIPP to delegate coding tasks to TRAE's SOLO agent while maintaining orchestration control.

```
┌─────────────────────────────────────────────────────────────────┐
│  KIPP (OpenClaw)                                                │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────┐  │
│  │ MCP Client  │───▶│ Unix Socket      │───▶│ TRAE Extension│  │
│  │ (OpenClaw)  │    │ /tmp/trae-mcp.sock│    │ (MCP Server)  │  │
│  └─────────────┘    └──────────────────┘    └───────┬───────┘  │
│                                                      │          │
│                                             VS Code API         │
│                                                      │          │
│                                             ┌───────▼───────┐  │
│                                             │  TRAE SOLO    │  │
│                                             │  Agent        │  │
│                                             │  (Rust)       │  │
│                                             └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### `extension/` — TRAE IDE Extension (MCP Server)

A VS Code/TRAE extension that exposes these tools over a Unix socket:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Write/create files |
| `list_dir` | List directory entries |
| `search_codebase` | Grep search |
| `run_command` | Execute shell commands |
| `open_file` | Open file in editor |
| `get_workspace` | Get workspace info |
| `get_symbols` | Get code symbols |
| `invoke_solo_agent` | Delegate to TRAE SOLO agent |

### `openclaw-skill/` — OpenClaw MCP Client Skill

The OpenClaw skill that connects to the TRAE MCP server and exposes its tools to KIPP.

## Setup

### 1. Install the Extension in TRAE

```bash
cd extension
npm install
npm run compile
# Then in TRAE: Ctrl+Shift+P → "Developer: Install Extension from Location"
# Select the extension directory
```

Or copy the extension to TRAE's extensions directory:
```bash
cp -r dist/ ~/.config/Trae/extensions/
```

### 2. Activate the Extension

In TRAE:
1. Open the Command Palette (`Ctrl+Shift+P`)
2. Run **"TRAE MCP: Start Server"**

The MCP server will start on `/tmp/trae-openclaw-mcp.sock`.

### 3. Use from OpenClaw (KIPP)

Once the extension is running, KIPP can directly call the MCP tools:

```
KIPP, read the file src/app.ts in the workspace and explain what it does.
KIPP, delegate this bug fix to TRAE: the login button doesn't work on mobile.
```

## Development

```bash
# Build extension
cd extension
npm install
npm run compile

# Watch mode
npm run watch

# Test MCP connection
nc -U /tmp/trae-openclaw-mcp.sock
{"jsonrpc":"2.0","id":1,"method":"ping"}
```

## Project Status

- [x] MCP server scaffold (extension)
- [x] Core tools (read, write, search, list, symbols)
- [ ] SOLO agent IPC reverse-engineering
- [ ] OpenClaw MCP client skill (full integration)
- [ ] Installation script
- [ ] Demo / screencast

## License

MIT
