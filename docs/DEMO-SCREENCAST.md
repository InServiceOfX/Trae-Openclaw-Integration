# Demo Screencast — TRAE × OpenClaw Integration

**Duration:** ~90 seconds
**Recording:** OBS Screen Capture (full desktop)
**Demo Style:** Live demonstration with voiceover

---

## SETUP

Open TRAE and openclaw-tui side by side.
Start OBS recording.

---

## STEP 1 — Introduction (0:00–0:15)

**[SCREENCAP]** Show TRAE IDE on left, openclaw-tui terminal on right.

**[NARRATE]**
> "OpenClaw is an AI agent that orchestrates the TRAE IDE through its MCP — Model Context Protocol — infrastructure. It connects to TRAE as a local MCP server, enabling full IDE control through text commands."

---

## STEP 2 — Install the Extension (0:15–0:30)

**[SCREENCAP]** In TRAE, press `Ctrl+Shift+P`. Type `Developer: Install Extension from Location`. Navigate to:
```
~/workspace2/repos/Trae-Openclaw-Integration/extension/
```
Click to select. Reload window.

**[NARRATE]**
> "This is a real, installable TRAE extension. You can install it into any TRAE or VS Code IDE — here's the installation process live."

---

## STEP 3 — GitHub Repos via TRAE MCP (0:30–1:00)

**[SCREENCAP]** In openclaw-tui, type:
```
Search GitHub repos via TRAE MCP
```
Press Enter. Show results appearing.

**[NARRATE]**
> "OpenClaw routes through TRAE's MCP infrastructure to query the GitHub API. These are my repositories — returned live through the TRAE integration layer."

Show the results:
- Monoclaw — code generation monorepo
- Trae-Openclaw-Integration — this project
- InServiceOfX — deep learning monorepo
- PromptsCollection — AI prompt library
- aisticker-saas — SvelteKit SaaS starter

---

## STEP 4 — Docker Containers via TRAE MCP (1:00–1:15)

**[SCREENCAP]** In openclaw-tui, type:
```
List Docker containers via TRAE MCP
```
Press Enter. Show container list.

**[NARRATE]**
> "Same architecture — Docker containers listed through TRAE MCP. Here you see a llama.cpp server running Qwen3.5 locally, and a Postgres database."

---

## STEP 5 — SOLO Mode Control (1:15–1:25)

**[SCREENCAP]** In openclaw-tui, type:
```
Switch to SOLO mode in TRAE
```
Press Enter. Watch the SOLO panel open live in TRAE.

**[NARRATE]**
> "And OpenClaw can control TRAE's SOLO agent mode — switching into SOLO directly from the terminal."

---

## STEP 6 — Wrap Up (1:25–1:35)

**[SCREENCAP]** Toggle back to IDE:
```
Switch back to IDE mode
```

Open the GitHub repo in browser:
```
https://github.com/InServiceOfX/Trae-Openclaw-Integration
```

**[NARRATE]**
> "Trae-Openclaw-Integration — a real, installable extension that brings OpenClaw agent orchestration to TRAE IDE. Built with TRAE AI."

---

## STEP 7 — Finish (1:35)

**[SCREENCAP]** Stop OBS recording.

**[NARRATE]**
> "That's it. Thank you."

---

## QUICK REFERENCE — What to Type to Me

These are the exact things to type to me during the demo:

---

**STEP 1 — Intro** *(no action needed, just talk)*

---

**STEP 2 — Install extension** *(show in TRAE, no typing)*

---

**STEP 3 — GitHub repos:**
```
Search GitHub repos via TRAE MCP
```

**STEP 4 — Docker containers:**
```
List Docker containers via TRAE MCP
```

**STEP 5 — SOLO mode:**
```
Switch to SOLO mode in TRAE
```

**STEP 6 — Back to IDE:**
```
Switch back to IDE mode
```
Then open: https://github.com/InServiceOfX/Trae-Openclaw-Integration

---

## POST-RECORDING

- Export OBS recording as MP4
- Upload to YouTube (unlisted) or attach directly to Devpost
- Stop OBS recording

---

## DEVPOST SUBMISSION TEXT

**Project Name:** TRAE-OpenClaw Integration

**Tagline:** An installable TRAE extension that lets any OpenClaw AI agent orchestrate the IDE through MCP — controlling GitHub, Docker, file operations, and SOLO agent mode via text commands.

**Description:**

This project demonstrates a deep integration between OpenClaw — an AI agent powered by MiniMax — and the TRAE IDE. The core innovation is an installable VS Code/TRAE extension that exposes an MCP server, allowing OpenClaw to:

1. Call external MCP tools (GitHub API, Docker, Filesystem) through TRAE's infrastructure
2. Control TRAE's SOLO agent mode — switching between IDE and SOLO
3. Execute file operations, terminal commands, and workspace management directly
4. Create custom agents within TRAE programmatically

The system uses the MiniMax M2.7 model as the reasoning layer that interprets commands and routes them through TRAE's MCP infrastructure to external services (GitHub, Docker) and internal IDE controls (SOLO mode).

**Built with:** TRAE AI, MiniMax API (M2.7)

**GitHub:** https://github.com/InServiceOfX/Trae-Openclaw-Integration
