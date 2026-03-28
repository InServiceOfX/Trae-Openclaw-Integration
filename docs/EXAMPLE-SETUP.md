# TRAE OpenClaw Integration — Example Setup Guide

> Copy this file to your OpenClaw workspace (`memory/`) and adapt it for your setup.
> This is a reference configuration for integrating any OpenClaw instance with TRAE IDE.

---

## What This Does

This integration lets **any OpenClaw agent** control the TRAE IDE by:
1. Running an MCP server inside TRAE (exposed via VS Code extension)
2. Connecting to it from OpenClaw over a Unix socket
3. Using TRAE as a coding agent alongside OpenClaw's orchestration

---

## Prerequisites

- TRAE IDE installed on the same machine as OpenClaw
- OpenClaw running (any model)
- Node.js 18+ (for extension development)
- Python 3.8+ (for the standalone MCP server)

---

## Step 1: Install the TRAE Extension

```bash
# Clone the integration repo
git clone https://github.com/InServiceOfX/Trae-Openclaw-Integration.git
cd Trae-Openclaw-Integration

# Install extension dependencies
cd extension && npm install
npm run compile
```

**In TRAE:**
1. `Ctrl+Shift+P` → `Developer: Install Extension from Location`
2. Select the `extension/` folder inside `Trae-Openclaw-Integration`
3. `Ctrl+Shift+P` → `TRAE MCP: Start Server`

Verify:
```bash
ls -la /tmp/trae-openclaw-mcp.sock  # Should exist
```

---

## Step 2: (Optional) Register the Python MCP Server

For TRAE's built-in AI to use your MCP tools:

```bash
# Create MCP config directory
mkdir -p ~/.config/Trae

# Add to MCP config (if ~/.config/Trae/mcp.json exists, merge carefully)
cat > ~/.config/Trae/mcp.json << 'EOF'
{
  "mcpServers": {
    "trae-openclaw": {
      "command": "python3",
      "args": ["/FULL/PATH/TO/Trae-Openclaw-Integration/mcp_server.py"]
    }
  }
}
EOF
```

Reload TRAE: `Ctrl+Shift+P` → `Developer: Reload Window`

---

## Step 3: Connect from OpenClaw

In your OpenClaw workspace, add this to your skill configuration:

```markdown
## TRAE MCP Integration

Connect to TRAE at: `/tmp/trae-openclaw-mcp.sock`

Available tools (via mcp_client.py or direct socket):
- start_solo_mode: toggle SOLO mode
- send_to_solo_chat: paste text into SOLO chat
- read_file, write_file, list_dir, search_codebase
- run_command, open_file, get_symbols
- open_mcp_config, list_mcp_servers, add_mcp_server
```

---

## Step 4: Test

From OpenClaw, try:
```
Toggle SOLO mode in TRAE
List the MCP servers configured in TRAE
Open the GitHub MCP settings
```

---

## Adding MCP Servers

Popular MCP servers to add to `~/.config/Trae/User/mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {"GITHUB_TOKEN": "YOUR_TOKEN_HERE"}
    },
    "docker": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-docker"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
    }
  }
}
```

After editing, reload TRAE: `Ctrl+Shift+P` → `Developer: Reload Window`

---

## File Structure

```
Trae-Openclaw-Integration/
├── extension/           ← VS Code extension (MCP server in TRAE)
│   ├── src/extension.ts # The MCP server implementation
│   └── dist/           # Compiled JS
├── mcp_server.py       ← Standalone Python MCP server (alternative to extension)
├── mcp_client.py       ← Python client to call MCP tools
├── test_workflow.py    ← Integration test script
├── openclaw-skill/     ← OpenClaw skill documentation
│   └── SKILL.md        ← Full skill reference
└── docs/
    ├── ARCHITECTURE.md
    ├── SOLO-AGENT-RESEARCH.md
    ├── USER-GUIDE.md
    ├── API-REFERENCE.md
    └── EXAMPLE-SETUP.md ← This file
```

---

## Troubleshooting

**Socket not found:**
```
Ctrl+Shift+P → TRAE MCP: Start Server
```

**SOLO chat commands fail:**
- The `icube.ai-chat.*` commands are webview-only
- Use `send_to_solo_chat` (clipboard paste workaround)
- Or open SOLO manually and type

**MCP servers not showing in TRAE AI:**
- Check `~/.config/Trae/User/mcp.json` syntax (valid JSON)
- Reload TRAE after changes
- Check TRAE output pane for MCP errors

---

## Customization

- Change socket path: edit `extension/src/extension.ts` → `socketPath` config
- Add new tools: add to `TOOLS` object in `extension.ts`
- For different OS: adjust socket path (`/tmp` works on Linux/macOS)

---

*This is an example setup guide. Copy to your workspace and adapt paths and tokens as needed.*
