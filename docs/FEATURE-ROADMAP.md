# TRAE OpenClaw Integration — Feature Roadmap

Research date: 2026-03-28
Source: docs.trae.ai

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

---

## New Features from TRAE Docs

### Priority 1 — High Value, Achievable

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

1. Does TRAE expose a command to trigger SOLO Builder deployment to Vercel?
2. Can we create custom agents programmatically (storage format)?
3. What's the SUPABASE integration CLI/API?
4. Can DiffView results be read programmatically?
5. Can we trigger Plan/Spec mode programmatically?
6. Is there a `trae.solo.builder.deploy` command?

---

## Most Impactful Next Steps

1. **Add Playwright MCP** — web testing/automation is high value
2. **HTTP MCP server** — extend `mcp_server.py` to serve over HTTP for remote access
3. **Project MCP setup** — auto-create `.trae/mcp.json` for projects
4. **Browser tool** — add screenshot capability via Playwright
5. **Vercel deployment** — research if SOLO Builder deployment is triggerable via command
