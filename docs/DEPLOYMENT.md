# DEPLOYMENT.md — Deploying from TRAE SOLO Builder

Research date: 2026-03-28  
Source: TRAE workbench JS reverse-engineering + live command inspection

---

## Overview

TRAE SOLO Builder has built-in **Vercel deployment integration**. When you're in SOLO mode building a web app, you can connect your Vercel account and deploy directly from the TRAE IDE.

---

## How Deployment Works in TRAE

### Internal Architecture

From reverse-engineering `workbench.desktop.main.js`, TRAE has these deployment-related signals:

```
deploy_click                  — User clicked deploy button
deploy_connect_vercel_click   — User clicked "Connect Vercel"
deploy_auth_click             — Vercel OAuth authorization
deploy_auth_popup_show        — OAuth popup shown
deploy_open_preview           — Preview of deployed URL opened
deploy_request                — Deployment API request sent
deploy_failed                 — Deployment failed
deploy_check_log_click        — User viewed deployment logs
deploy_ai_resolve_click       — AI helped resolve deployment error
```

### Error categories (internal):
```
deploy error: getVercelAPIHost      — API host resolution failed
deploy error: initVercelignore      — .vercelignore setup failed  
deploy error: readVercelProjectConfig    — vercel.json read failed
deploy error: rewriteVercelConfig        — vercel.json write failed
deploy error: rewriteVercelProjectConfig — project config write failed
deploy error: startDeploy                — deployment start failed
deploy error: startDeploy catch          — exception during deploy
deploy error: startDeploy resp           — bad response from API
deploy: getDomain error                  — domain resolution failed
```

### TRAE Commands Relevant to Deployment

```typescript
// Primary deploy command (discovered via icube tooling API)
'icube.common.commands.tooling.deployToRemote'   // ← main deploy trigger

// SOLO Builder UI
'trae.solo.guide.showSoloBuild'                  // Show SOLO Build guide
'trae.solo.guide.tryShowSoloGuide'               // Try to show SOLO guide

// Integration panel (where Vercel settings live)
'icube.ai.focus-to-integration-view'             // Focus the integrations panel
'icube.ai.focus-to-supabase-view'                // Supabase panel
```

---

## Step-by-Step: Deploying via TRAE SOLO Builder UI

1. **Open TRAE** and ensure you're in SOLO mode  
   (`Ctrl+Shift+P` → "Toggle SOLO Mode")

2. **Open a project** with a web frontend (Next.js, React, Vue, etc.)

3. **Connect Vercel** (one-time setup):
   - Click the deployment icon in SOLO Builder sidebar
   - Select "Connect to Vercel"
   - Authorize via OAuth popup
   - Select/create a Vercel project

4. **Trigger deployment**:
   - Click "Deploy" in the SOLO Builder panel
   - Monitor build logs in the panel
   - Preview URL appears when done

5. **Preview**: Click "Open Preview" to open the deployed app URL

---

## How OpenClaw Can Trigger Deployments

### Method 1: Via MCP Tool `open_deploy_panel`

```json
{
  "method": "tools/call",
  "params": {
    "name": "open_deploy_panel",
    "arguments": {}
  }
}
```

This tries these commands in sequence:
1. `icube.common.commands.tooling.deployToRemote` — direct deploy
2. `trae.solo.guide.showSoloBuild` — opens SOLO Build UI
3. `icube.ai.focus-to-integration-view` — opens integrations panel

### Method 2: Via Terminal Command

```json
{
  "method": "tools/call",
  "params": {
    "name": "run_command",
    "arguments": {
      "command": "vercel --yes",
      "cwd": "/path/to/project"
    }
  }
}
```

Requires Vercel CLI: `npm install -g vercel`

### Method 3: Via TRAE Terminal (interactive)

```json
{
  "method": "tools/call",
  "params": {
    "name": "run_terminal_command",
    "arguments": {
      "command": "vercel deploy --prod",
      "terminalName": "Vercel Deploy"
    }
  }
}
```

---

## Vercel CLI Integration (Recommended for Automation)

Install the Vercel CLI for programmatic deployments:

```bash
npm install -g vercel
vercel login          # One-time auth
vercel link           # Link project to Vercel
```

Then trigger from OpenClaw:

```python
# Via mcp_client.py
result = call_tool("run_command", {
    "command": "vercel deploy --prod --yes",
    "cwd": "/path/to/project",
    "timeout": 120000
})
```

### Environment Variables for CI/CD

```bash
export VERCEL_TOKEN="your-token"
export VERCEL_ORG_ID="your-org-id"
export VERCEL_PROJECT_ID="your-project-id"
vercel deploy --prod --token=$VERCEL_TOKEN
```

---

## `vercel.json` Configuration (Auto-managed by TRAE)

TRAE reads and potentially rewrites `vercel.json`. Standard format:

```json
{
  "version": 2,
  "name": "my-app",
  "builds": [
    { "src": "package.json", "use": "@vercel/next" }
  ],
  "env": {
    "DATABASE_URL": "@database-url"
  }
}
```

---

## Deployment Status Check

After deployment, check status via:

```json
{
  "method": "tools/call",
  "params": {
    "name": "run_command",
    "arguments": {
      "command": "vercel ls --limit 5"
    }
  }
}
```

---

## Limitations & Notes

1. **OAuth required**: TRAE's built-in Vercel deploy requires OAuth through the TRAE UI first. The `deployToRemote` command likely requires an active Vercel session.

2. **SOLO mode required**: The deployment panel is only accessible in SOLO Builder mode.

3. **Direct API fallback**: For fully automated deployments, use Vercel CLI (`vercel deploy`) via `run_command` — this bypasses TRAE's UI entirely and works without SOLO mode.

4. **`icube.common.commands.tooling.deployToRemote`**: This command was found in TRAE's workbench JS as part of the AI tooling API. Its exact parameter format is unknown — it may require a deployment config object.

---

## Known TRAE + Vercel Files

| File | Purpose |
|------|---------|
| `vercel.json` | Project configuration |
| `.vercelignore` | Files to exclude from deploy |
| `.vercel/project.json` | Links project to Vercel org/project |
| `.vercel/README.txt` | Vercel CLI metadata |

---

## Future Research

- Reverse-engineer exact parameters for `icube.common.commands.tooling.deployToRemote`
- Determine if `deploy_request` telemetry event can be intercepted
- Check if TRAE stores Vercel tokens in `~/.config/Trae/User/globalStorage/`
- Test `trae.solo.guide.showSoloBuild` in active SOLO mode session
