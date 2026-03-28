# TRAE SOLO Agent — Research Findings

**Date:** 2026-03-28
**Status:** Research complete — integration approach identified

---

## Architecture Overview

The TRAE SOLO agent runs as an **Electron NativeExtensionService** process (`ai_agent`, Rust binary) inside the TRAE IDE. It is **not** a standalone subprocess in the traditional sense.

```
┌─────────────────────────────────────────────────────────────┐
│ TRAE IDE (Electron)                                         │
│  ┌────────────────┐    ┌──────────────────────────────────┐ │
│  │ Extension Host │───▶│ NativeExtensionService (Rust)   │ │
│  │ (Node.js)      │    │  - ai_agent (pid varies)        │ │
│  └────────────────┘    │  - AHA-IPC FFI layer            │ │
│         │               │  - jsonrpsee RPC server          │ │
│         ▼               │  - cloud-connected               │ │
│  VS Code API           └────────┬─────────────────────────┘ │
│  (commands,                  AHA-IPC (FFI)                  │
│   extensions)                    │                           │
│                                  ▼                           │
│                      ┌────────────────────────┐            │
│                      │ ByteDance Cloud API     │            │
│                      │ core-normal.traeapi.us │            │
│                      └────────────────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

## IPC Mechanism: AHA-IPC

**Type:** ByteDance proprietary FFI-based IPC (not Unix sockets, not named pipes)

- **Transport:** Native C FFI via `byted_aha_ffi` library
- **RPC:** `jsonrpsee` (Rust JSON-RPC library)
- **No traditional sockets** — connections happen via in-process FFI handles
- **Service discovery:** `AHA_RUNTIME_DIR` environment variable (usually `~/.config/Trae/`)
- **Connection identity:** 8-byte binary identity (e.g., `[112, 182, 186, 50, 0, 0, 0, 0]`)

### Log Evidence
```
[aha_ipc] init_aha_ipc: spawning server task
[aha_ipc] run_server, AHA_RUNTIME_DIR: Err(NotPresent)  ← uses default path
[aha_ipc] server started on service: ai-agent
[aha_ipc] new FFI connection accepted, id=851097200
[aha_ipc] jsonrpsee server started, waiting for stop...
```

## Exposed Services & Methods

The `ai_agent` Rust binary exposes these JSON-RPC services:

| Service | Method | Notes |
|---------|--------|-------|
| `healthcheck` | `ping` | Connectivity check |
| `chat` | `create_session` | Creates a new chat/agent session |
| `chat` | `get_messages` | Retrieves messages in a session |
| `chat` | `get_sessions` | Lists all sessions |
| `agent` | `get_agents` | Lists available agents (solo, solo_builder, etc.) |
| `model` | `model_list` | Lists available models |
| `model` | `model_list_by_function` | Models filtered by function |
| `model` | `get_model_selection_modes` | Model selection modes |
| `configuration` | `get_user_configuration` | User config from cloud |
| `core_memory` | `get_core_memories` | Agent core memory |
| `snapshot` | `get_file_list` | Snapshot/file tracking |
| `todo_list` | `get_current_todo_list_by_session` | Todo items |
| `ckg` | `setup`, `init`, `refresh_token`, `get_build_status`, `document_action`, `is_ckg_enabled_for_non_workspace_scenario` | Code knowledge graph |
| `commercial` | `get_tenant_user_config` | Commercial/licensing config |
| `privacy_mode` | `get_privacy_mode` | Privacy settings |

## Cloud Connectivity

The SOLO agent is **not purely offline**. On startup it:
1. Calls `https://core-normal.traeapi.us/api/ide/v1/get_detail_param` with `function=solo_coder` and `function=solo_builder`
2. Fetches dynamic config including feature gates, model configs, auto-run rules
3. Model selection modes fetched from `https://core-normal.traeapi.us/api/v1/commercial/chat_mode`

This means the SOLO agent's behavior is partly controlled by ByteDance's cloud — not fully self-contained.

## Sandbox / Security

The agent uses a **sandbox whitelist** for file system access:

**Read-write allowed:** `/tmp`, `~/Library/Caches`, `~/.cache`, `~/.local/lib`, `~/.cargo`, `~/go`, `~/.npm`, `~/.gvm`, etc.

**Read-only allowed:** `$WORKSPACE_FOLDER/.vscode`, `$WORKSPACE_FOLDER/.trae/mcp.json`

**Blocked:** All other paths require explicit workspace folder context.

## Key Insight for Integration

Since `aha_ipc` is ByteDance's internal FFI mechanism, we **cannot directly inject** into the SOLO agent's RPC from outside the TRAE process.

### Practical Integration Approaches

1. **VS Code Command API** (our approach): Our extension registers commands that the user or OpenClaw can invoke. The extension can attempt to call `vscode.commands.executeCommand('icube.solo.executeTask', { task })` — this may work in SOLO mode.

2. **Chat Service API**: We could call `chat.create_session` + send messages via our extension if TRAE exposes this via a registered VS Code command.

3. **File-based delegation**: Write task instructions to a file in the workspace, trigger a TRAE agent run, read results from an output file.

4. **MCP as the integration layer**: Our MCP server exposes file/workspace tools that TRAE's agent can use. The agent can call our MCP tools as external tools if MCP is configured.

## `invoke_solo_agent` Tool Implementation

The current implementation in `extension/src/extension.ts` attempts:

```typescript
const result = await vscode.commands.executeCommand('icube.solo.executeTask', { task });
```

If this fails (command not registered), it falls back to returning an instruction for manual action. This is the graceful degradation strategy.

## Open Questions

- [ ] Does `icube.solo.executeTask` actually exist as a registered VS Code command?
- [ ] Can we trigger SOLO agent via `chat.create_session` + message passing through an extension command?
- [ ] What is the full `icube.*` namespace of registered commands?
- [ ] Does TRAE support MCP server discovery via `~/.trae/mcp.json` (mentioned in sandbox_ro_list)?

## Files Referenced

- Extension bundle: `/usr/share/trae/resources/app/extensions/ai-completion/dist/extension.js`
- Main workbench: `/usr/share/trae/resources/app/out/vs/workbench/workbench.desktop.main.js`
- AI agent log: `~/.config/Trae/logs/20260328*/Modular/ai-agent_*_stdout.log`
- AI agent DB: `~/.config/Trae/ModularData/ai-agent/database.db`
