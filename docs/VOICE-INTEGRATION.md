# Voice Integration Guide

> Turn spoken words into SOLO chat messages — offline or cloud-powered.

---

## Overview

The voice pipeline connects a microphone to TRAE's SOLO chat. It supports:

- **Browser-based recording** via `speech_to_solo.html` (Web Speech API, no install)
- **Mic recording + cloud STT** via MiniMax API
- **Mic recording + local STT** via [OpenAI Whisper](https://github.com/openai/whisper) (fully offline)

Text is delivered to SOLO chat via xdotool (auto-type), xclip (clipboard), or printed to terminal.

---

## Quick Start

### 1. Install dependencies

```bash
bash scripts/install-deps.sh
```

Or manually:

```bash
sudo apt-get install -y xclip xdotool ffmpeg python3-pip
pip install requests
pip install openai-whisper   # optional, for offline STT
```

### 2. Choose your workflow

#### Option A — Browser (easiest, no install)

1. Open `speech_to_solo.html` in Chrome/Firefox
2. Click **Hold to Speak** and say something
3. Click **Send to SOLO Chat** — transcript copies to clipboard
4. Run:
   ```bash
   python3 voice_pipeline.py
   ```
   Script pastes the clipboard text into SOLO chat.

#### Option B — Offline Whisper (no API key needed)

```bash
# Record 5 seconds from mic and transcribe locally
python3 voice_pipeline.py --record 5 --use-whisper
```

First run downloads the Whisper `base` model (~140 MB). Subsequent runs are instant.

#### Option C — Cloud STT (MiniMax API)

```bash
export MINIMAX_API_KEY=your_key_here
python3 voice_pipeline.py --record 5
```

Or store it in a `.env` file:

```
MINIMAX_API_KEY=your_key_here
```

---

## CLI Reference

```
python3 voice_pipeline.py [OPTIONS]

Options:
  --use-whisper           Use local Whisper model instead of MiniMax API
  --whisper-model MODEL   Whisper model size: tiny, base, small, medium, large
                          Default: base (~140MB, good accuracy)
  --record SECONDS        Record N seconds from microphone, then transcribe
  --transcribe FILE       Transcribe an existing audio file
  --clipboard             Show current clipboard contents
  --dry-run               Transcribe only, don't deliver to SOLO
  --help                  Show this help
```

### Examples

```bash
# Browser flow: paste clipboard to SOLO
python3 voice_pipeline.py

# Record 10s and transcribe offline
python3 voice_pipeline.py --record 10 --use-whisper

# Use a bigger Whisper model for better accuracy
python3 voice_pipeline.py --record 5 --use-whisper --whisper-model small

# Transcribe an existing file
python3 voice_pipeline.py --transcribe meeting.wav --use-whisper

# Test transcription without delivering to SOLO
python3 voice_pipeline.py --record 5 --use-whisper --dry-run
```

---

## Text Delivery Methods

The script auto-detects the best delivery method:

| Method | How it works | Install |
|--------|-------------|---------|
| `xdotool` | Auto-types text into focused window (best) | `sudo apt install xdotool` |
| `xclip` | Copies to clipboard (Ctrl+V to paste) | `sudo apt install xclip` |
| `xsel` | Copies to clipboard (Ctrl+V to paste) | `sudo apt install xsel` |
| `tkinter` | Copies to clipboard via Python | Built-in on Ubuntu |
| `print` | Prints text to terminal, paste manually | Always available |

Install `xdotool` for the smoothest experience — it types directly into the focused SOLO chat window.

---

## Whisper Model Sizes

| Model | Size | Speed | Accuracy | Use case |
|-------|------|-------|----------|----------|
| `tiny` | ~75 MB | Very fast | Basic | Quick tests |
| `base` | ~140 MB | Fast | Good | **Default, recommended** |
| `small` | ~465 MB | Medium | Better | Longer sentences |
| `medium` | ~1.5 GB | Slow | High | Important transcripts |
| `large` | ~3 GB | Very slow | Best | Professional use |

Models are downloaded once to `~/.cache/whisper/`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Voice Pipeline                          │
│                                                          │
│  Input:                                                  │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │ Browser (HTML5) │    │  Mic (ffmpeg --record N) │    │
│  │ Web Speech API  │    │  → WAV file              │    │
│  └────────┬────────┘    └───────────┬──────────────┘    │
│           │ clipboard               │ audio file        │
│           │                        ▼                    │
│           │             ┌─────────────────────┐         │
│           │             │ STT Engine          │         │
│           │             │  ├─ Whisper (local) │         │
│           │             │  └─ MiniMax (cloud) │         │
│           │             └──────────┬──────────┘         │
│           │                        │ text               │
│           └────────────┬───────────┘                    │
│                        ▼                                 │
│           ┌────────────────────────┐                    │
│           │ Delivery               │                    │
│           │  ├─ xdotool (auto-type)│                    │
│           │  ├─ xclip (clipboard)  │                    │
│           │  └─ print (manual)     │                    │
│           └──────────┬─────────────┘                    │
│                      │ text in SOLO chat                 │
└──────────────────────┼──────────────────────────────────┘
                       ▼
             ┌──────────────────┐
             │  TRAE SOLO Chat  │
             │  via MCP socket  │
             └──────────────────┘
```

---

## Troubleshooting

### No audio device / recording fails

```bash
# List available audio devices
arecord -l

# Test mic
arecord -d 3 test.wav && aplay test.wav
```

If no devices found, check if PulseAudio/PipeWire is running:
```bash
pactl info
```

### Whisper model download slow

Models cache to `~/.cache/whisper/`. After first download, runs are instant.
You can also pre-download:
```python
import whisper
whisper.load_model("base")  # Downloads and caches
```

### xdotool not typing in correct window

Make sure the TRAE SOLO chat window is focused before running the script.
Alternatively, use clipboard mode:
```bash
# Just copies to clipboard, paste manually
python3 voice_pipeline.py  # with only xclip installed
```

### MiniMax API key not working

Check the key is set:
```bash
echo $MINIMAX_API_KEY
```

Or add to `.env` file in the repo root:
```
MINIMAX_API_KEY=your_key_here
```

---

## Related Files

| File | Description |
|------|-------------|
| `voice_pipeline.py` | Main pipeline script |
| `speech_to_solo.html` | Browser-based speech recording UI |
| `scripts/install-deps.sh` | Dependency installer |
| `mcp_server.py` | MCP server (provides `start_solo_mode` tool) |
| `docs/ARCHITECTURE.md` | Overall system architecture |

---

## Future Improvements

- [ ] WebSocket-based real-time streaming STT
- [ ] Wake word detection (`hey SOLO`)
- [ ] Speaker diarization (who said what)
- [ ] Voice commands beyond transcription (`"search for X"`, `"open file Y"`)
- [ ] System tray indicator for recording state
- [ ] Integration with TRAE's built-in voice features (when available)
