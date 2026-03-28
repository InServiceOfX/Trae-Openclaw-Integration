# TRAE OpenClaw Integration — Feature Roadmap

Research date: 2026-03-28 (updated)
Source: docs.trae.ai + workbench JS reverse-engineering

---

## What We Have Now ✅

| Feature | Status | Implementation |
|---------|--------|---------------|
| File tools (read/write/list/search) | ✅ Working | `mcp_server.py` + extension |
| SOLO mode toggle | ✅ Working | `trae.solo.mode.toggle` |
| GitHub MCP | ✅ Working | `call_mcp_server` → GitHub MCP |
| MCP management (list/add/open config) | ✅ Working | extension tools |
| Memory MCP | ✅ Configured | In TRAE User mcp.json |
| Terminal commands | ✅ Working | `run_command` / `run_terminal_command` |
| Playwright MCP | ✅ Configured | In TRAE User mcp.json |
| Deploy panel access | ✅ Added | `open_deploy_panel` tool |
| Browser tool access | ✅ Added | `open_browser_tool` tool |
| Trajectory/plan state | ✅ Added | `get_trajectory_state` tool |

---

---

## New Research Findings (2026-03-28 Deep Dive)

### TRAE Internal Tooling API (icube.common.commands.tooling.*)

From reverse-engineering `workbench.desktop.main.js`, TRAE exposes a rich internal tooling API:

```
browserListTabs              ← List open browser tabs
browserUseTool               ← Control the AI browser (navigate, screenshot, click, etc.)
checkRunCommandStatus        ← Check if a terminal command is still running
checkRuntimeEnvInitializeStatus ← Sandbox/container init status
deployToRemote               ← TRIGGER VERCEL DEPLOYMENT ← high value
fileDiffCount                ← Count files changed by SOLO agent
getActiveRuntimeEnvironmentList ← List active sandboxes/containers
getAllAgentExtensions         ← List all MCP agent extensions
getAutoRunConfig             ← Auto-run settings
getDefinitions               ← Go-to-definition (code nav)
getDiagnostics               ← TypeScript/lint errors
getFileDiff                  ← Get diff of specific file
getNextAvailableTerminal     ← Get a free terminal
getPreviewLog                ← Preview server logs
getReferences                ← Find all references
getRulesDetails              ← TRAE rules/context details
getSandboxCliPath            ← Sandbox CLI tool path
getStripeConfig              ← Stripe integration config
getTextByRange               ← Read file by line range
hasStreamingTask             ← Is SOLO currently running? ← trajectory state
initializeRuntimeEnvironment ← Start a sandbox/container
killTerminalRunningCommand   ← Kill a terminal process
listFolder                   ← List directory
openAIDocFile                ← Open AI documentation
openPreview                  ← Open preview server ← browser tool
printCurrentDiagnostics      ← Print diagnostics to output
readContentInTerminal        ← Read terminal buffer
readFile                     ← Read file
refreshStripePrices          ← Stripe prices
runAgentExtension            ← Run an MCP agent extension
runCommandInTerminal         ← Run in terminal (async)
runCommandInTerminalSync     ← Run in terminal (sync)
searchGlobal                 ← Global search
sendToCommand                ← Send text to a command
statFile                     ← File metadata
writeFile                    ← Write file
writeSSEFile                 ← Write SSE stream file
```

### Newly Discovered icube.* Commands

```
icube.browser.humanTakeOver          ← Human takes control from AI browser
icube.preview.show                   ← Show preview webview
icube.preview.new_exception          ← Preview exception handling
icube.worktree.*                     ← Git worktree management
icube.session.updateWorktreeAfterMerge ← Worktree post-merge
icube.userConfiguration.get          ← Get user config
icube.webview.sendCommand            ← Send command to webview
icube.ai.agentImport                 ← Import a custom agent ← high value
icube.ai.developer.agentImportFromSchema ← Import agent from schema ← create agents!
icube.cloudide.getAgentUrl           ← Get agent URL
icube.common.commands.tooling.runAgentExtension ← Run MCP agent
icube.common.commands.tooling.getAllAgentExtensions ← List all MCP agents
```

### Vercel Deployment Signals (telemetry events)

```
deploy_click                  ← Deploy button clicked
deploy_connect_vercel_click   ← Connect Vercel
deploy_auth_click             ← OAuth auth
deploy_auth_popup_show        ← OAuth popup
deploy_open_preview           ← Preview opened
deploy_request                ← API request sent
deploy_failed                 ← Failed
deploy_check_log_click        ← View logs
deploy_ai_resolve_click       ← AI resolved error
```

---

## New Features from TRAE Docs

### Priority 1 — High Value, Achievable

#### 0. NEW: Direct Tooling API Access (Priority 0 — Critical)

We should expose the `icube.common.commands.tooling.*` API directly:

```typescript
// Add tool: invoke_trae_tooling
// Allows calling any icube.common.commands.tooling.* command
invoke_trae_tooling: async (params) => {
  const tool = params.tool; // e.g., "hasStreamingTask"
  const args = params.args;
  return await vscode.commands.executeCommand(
    `icube.common.commands.tooling.${tool}`, args
  );
}
```

This would give OpenClaw access to ALL of TRAE's internal AI tools.

#### 1. Project-level MCP (`.trae/mcp.json`)
- Create `.trae/mcp.json` in project root for auto-loading per-project
- Enable via `Enable Project MCP` toggle in settings
- **Action:** Add tool `enable_project_mcp` that creates `.trae/mcp.json` and toggles the setting

#### 2. Add More MCP Servers
Already available in TRAE MCP marketplace:
- **Playwright** (`@playwright/mcp`) — web testing, automation, screenshots
- **Filesystem** (`@modelcontextprotocol/server-filesystem`) — enhanced file ops with permission controls
- **Docker** (`@modelcontextprotocol/server-docker`) — container management
- **Memory** (`@modelcontextprotocol/server-memory`) — already configured
- **Search** — codebase search MCP

**Action:** Add tool `install_mcp_server` that adds a new MCP server to User mcp.json from a template

#### 3. Streamable HTTP MCP (remote servers)
TRAE supports SSE and Streamable HTTP — meaning we could register a **remote MCP server**.
- Our `mcp_server.py` could listen on a TCP port (e.g., `:9191`) as an HTTP MCP server
- TRAE connects to it remotely
- **Action:** Add HTTP transport to `mcp_server.py`

#### 4. SOLO Builder Deployment (Vercel)
SOLO Builder can deploy to Vercel. Would need to:
- Figure out the Vercel OAuth/API integration
- See if there's a command to trigger deployment
- **Action:** Research `trae.solo.builder.deploy` or similar commands

---

### Priority 2 — Medium Complexity

#### 5. Custom Agents — Import & Orchestrate
TRAE supports one-click import of pre-made agents:
- UI Designer: https://s.trae.ai/a/878f64
- Frontend Architect: https://s.trae.ai/a/f8219e
- Backend Architect: https://s.trae.ai/a/92731a
- API Test Pro: https://s.trae.ai/a/55b143
- AI Integration Engineer: https://s.trae.ai/a/720a05
- DevOps Architect: https://s.trae.ai/a/8a2ce1
- Performance Expert: https://s.trae.ai/a/00067d
- Compliance Checker: https://s.trae.ai/a/c10186

**Action:** Add tool `import_custom_agent` that imports an agent via TRAE's agent import URL

#### 6. Plan Mode / Spec Mode for SOLO Coder
SOLO Coder has two modes:
- `/Plan` — small/medium features, editable plan → execute
- `/Spec` — complex systems, creates `spec.md`, `tasks.md`, `checklist.md` in `.trae/specs/`

**Action:** Add tool `solo_coder_mode` that sets the mode, and `solo_coder_execute_spec` that triggers execution

#### 7. Figma to Code MCP
TRAE has built-in Figma to code. The MCP server for it is `@figma/mcp-server` or similar.

#### 8. SUPABASE Integration
SOLO Builder integrates with Supabase for PostgreSQL database + frontend UI.

---

### Priority 3 — Deep Integration

#### 9. Create Custom Agent via API
TRAE allows creating custom agents with:
- Name, prompt, model, MCP servers, callable agents
- Stored in `~/.config/Trae/User/globalStorage/`

**Action:** Reverse-engineer agent storage format, add tool `create_custom_agent`

#### 10. Built-in Tools Access
TRAE's built-in tools for agents:
- `Read` — read files
- `Edit` — edit files
- `Terminal` — run commands
- `Browser` — browse URLs, take screenshots
- `Preview` — preview web apps
- `Web Search` — search the web

Our extension already covers most of these. The **Browser tool** for screenshots would be valuable to add.

#### 11. Custom Models Configuration
TRAE supports custom models via Settings → Models. Could be exposed as a tool.

#### 12. DiffView
After SOLO makes changes, DiffView shows affected files. We could add a tool to open/get DiffView results.

---

## MCP Transport Types Supported by TRAE

| Transport | Type | How to use |
|----------|------|------------|
| `stdio` | Local | `command`, `args[]`, `env{}` |
| `SSE` | Local/Remote | `url`, `headers{}` |
| `Streamable HTTP` | Local/Remote | `url`, `headers{}` |

**Our `mcp_server.py` supports stdio.** We could extend it to also serve HTTP.

---

## MCP Server Marketplace (Popular)

```
@modelcontextprotocol/server-github        # GitHub API ✅
@modelcontextprotocol/server-memory       # Memory ✅
@modelcontextprotocol/server-filesystem   # File ops
@modelcontextprotocol/server-git          # Git operations
@modelcontextprotocol/server-docker       # Docker
@modelcontextprotocol/serverpostgres     # PostgreSQL
@modelcontextprotocol/server-slack        # Slack
@modelcontextprotocol/server-aws          # AWS
@playwright/mcp                          # Web testing/automation
@figma/mcp-server                        # Figma to code
```

---

## SOLO Agent Architecture

```
SOLO Coder
├── Built-in: Read, Edit, Terminal, Browser, etc.
├── MCP Servers: github, memory, playwright, filesystem, etc.
├── Custom Agents (orchestrated): UI Designer, Frontend Architect, etc.
└── Modes:
    ├── Plan mode → editable task list → execute
    └── Spec mode → spec.md + tasks.md + checklist.md → execute
```

---

## Open Questions / Research Needed

1. ~~Does TRAE expose a command to trigger SOLO Builder deployment to Vercel?~~ **YES: `icube.common.commands.tooling.deployToRemote`**
2. Can we create custom agents programmatically? **Partially YES: `icube.ai.agentImport` and `icube.ai.developer.agentImportFromSchema`**
3. What's the SUPABASE integration CLI/API? → `icube.ai.connect-supabase-project`, `icube.ai.get-supabase-token`
4. Can DiffView results be read programmatically? → `icube.common.commands.tooling.getFileDiff` + `fileDiffCount`
5. Can we trigger Plan/Spec mode programmatically? → Needs more research (likely via `icube.ai-chat.sendMessage` with `/Plan` prefix)
6. ~~Is there a `trae.solo.builder.deploy` command?~~ **It's `icube.common.commands.tooling.deployToRemote`**

---

## Most Impactful Next Steps

1. **`invoke_trae_tooling` tool** — expose ALL `icube.common.commands.tooling.*` commands as one flexible tool
2. **Agent import tool** — use `icube.ai.agentImport` / `icube.ai.developer.agentImportFromSchema` to create custom agents
3. **`get_file_diff` tool** — use `icube.common.commands.tooling.getFileDiff` to review SOLO changes
4. **`check_terminal_status` tool** — use `checkRunCommandStatus` to poll terminal commands
5. **`read_terminal_buffer` tool** — use `readContentInTerminal` to get terminal output
6. **HTTP MCP server** — extend `mcp_server.py` to serve over HTTP for remote access
7. **Supabase integration** — expose `icube.ai.connect-supabase-project` and `get-supabase-token`
8. ~~Playwright MCP~~ **Already configured in TRAE User mcp.json** ✅
