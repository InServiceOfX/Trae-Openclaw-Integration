#!/usr/bin/env python3
"""
voice_pipeline.py — Voice → paste to SOLO chat

Usage:
    python3 voice_pipeline.py                        # Record mic → transcribe → paste/clipboard
    python3 voice_pipeline.py --use-whisper          # Use local Whisper STT (offline)
    python3 voice_pipeline.py --clipboard            # Just show clipboard contents
    python3 voice_pipeline.py --transcribe FILE.wav  # Transcribe an audio file
    python3 voice_pipeline.py --help                 # This help

How it works:
    1. Open speech_to_solo.html in browser (browser-based recording)
    2. Click 'Hold to Speak' → record your voice
    3. Click 'Send to SOLO Chat' → copies transcript to clipboard
    4. Run: python3 voice_pipeline.py → pastes to SOLO chat (or copies to clipboard)
    5. Press Enter in SOLO to send

    OR use --use-whisper for fully offline STT (no MiniMax API needed):
    python3 voice_pipeline.py --use-whisper --transcribe recording.wav

Keyboard automation:
    - If xdotool is installed: auto-types text into focused window
    - If xclip is installed: copies to clipboard
    - Otherwise: prints text and asks you to paste manually

    Install xclip+xdotool:
        sudo apt-get install -y xclip xdotool

Whisper STT (offline):
    Install once:
        pip install openai-whisper
    Then use:
        python3 voice_pipeline.py --use-whisper

MiniMax STT (cloud, default):
    Set MINIMAX_API_KEY env var or in .env file.

Requires: ffmpeg (for audio processing)
Optional: xclip, xdotool (keyboard automation), openai-whisper (offline STT)
"""

import subprocess
import os
import sys
import json
import socket
import shutil
import argparse
import tempfile

MCP_SOCKET = "/tmp/trae-openclaw-mcp.sock"

# ─── Tool detection ───────────────────────────────────────────────────────────

def has_command(cmd):
    """Check if a system command is available."""
    return shutil.which(cmd) is not None


def has_python_module(module):
    """Check if a Python module is importable."""
    import importlib.util
    return importlib.util.find_spec(module) is not None


def detect_clipboard_method():
    """
    Detect best available method for clipboard/keyboard automation.
    Returns: 'xdotool', 'xclip', 'xsel', 'tkinter', or 'print'
    """
    if has_command("xdotool"):
        return "xdotool"
    elif has_command("xclip"):
        return "xclip"
    elif has_command("xsel"):
        return "xsel"
    elif has_python_module("tkinter"):
        return "tkinter"
    else:
        return "print"


def detect_stt_method(prefer_whisper=False):
    """
    Detect best available STT method.
    Returns: 'whisper' or 'minimax'
    """
    if prefer_whisper or has_python_module("whisper"):
        if has_python_module("whisper"):
            return "whisper"
        else:
            print("⚠️  --use-whisper requested but openai-whisper not installed.")
            print("   Install with: pip install openai-whisper")
            print("   Falling back to MiniMax API...")
    return "minimax"


# ─── Clipboard & keyboard automation ─────────────────────────────────────────

def get_clipboard():
    """Get current clipboard text using best available method."""
    method = detect_clipboard_method()

    if method in ("xclip",):
        try:
            result = subprocess.run(
                ["xclip", "-selection", "clipboard", "-o"],
                capture_output=True, text=True, timeout=5
            )
            return result.stdout.strip()
        except Exception as e:
            print(f"xclip read error: {e}")

    if method in ("xsel",):
        try:
            result = subprocess.run(
                ["xsel", "--clipboard", "--output"],
                capture_output=True, text=True, timeout=5
            )
            return result.stdout.strip()
        except Exception as e:
            print(f"xsel read error: {e}")

    # Fallback: tkinter
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        text = root.clipboard_get()
        root.destroy()
        return text.strip()
    except Exception:
        return ""


def set_clipboard(text):
    """Copy text to clipboard using best available method."""
    method = detect_clipboard_method()

    if method == "xclip":
        try:
            proc = subprocess.run(
                ["xclip", "-selection", "clipboard"],
                input=text.encode(), timeout=5, check=True
            )
            print("📋 Copied to clipboard (xclip). Paste with Ctrl+V.")
            return True
        except Exception as e:
            print(f"xclip write error: {e}")

    elif method == "xsel":
        try:
            subprocess.run(
                ["xsel", "--clipboard", "--input"],
                input=text.encode(), timeout=5, check=True
            )
            print("📋 Copied to clipboard (xsel). Paste with Ctrl+V.")
            return True
        except Exception as e:
            print(f"xsel write error: {e}")

    elif method in ("tkinter", "xdotool"):
        try:
            import tkinter as tk
            root = tk.Tk()
            root.withdraw()
            root.clipboard_clear()
            root.clipboard_append(text)
            root.update()
            # Keep alive briefly so clipboard persists
            root.after(2000, root.destroy)
            root.mainloop()
            print("📋 Copied to clipboard (tkinter). Paste with Ctrl+V.")
            return True
        except Exception as e:
            print(f"tkinter clipboard error: {e}")

    print("⚠️  Could not copy to clipboard. Text:")
    print("─" * 60)
    print(text)
    print("─" * 60)
    return False


def paste_via_xdotool(text):
    """Type text directly using xdotool into the focused window."""
    import time

    ensure_solo_mode()
    time.sleep(0.5)

    try:
        subprocess.run(
            ["xdotool", "type", "--clearmodifiers", "--delay", "20", "--", text],
            timeout=30, check=False
        )
        print("⌨️  Typed text via xdotool.")
        return True
    except Exception as e:
        print(f"xdotool error: {e}")
        return False


def deliver_text(text):
    """
    Deliver transcribed text to SOLO chat using best available method.
    Priority: xdotool (auto-type) > xclip/xsel (clipboard) > tkinter (clipboard) > print
    """
    if not text:
        print("⚠️  No text to deliver.")
        return False

    method = detect_clipboard_method()
    print(f"📤 Delivery method: {method}")

    if method == "xdotool":
        # Auto-type into SOLO chat
        return paste_via_xdotool(text)
    else:
        # Copy to clipboard and instruct user
        success = set_clipboard(text)
        if success:
            print("   → Switch to SOLO chat and press Ctrl+V to paste.")
        return success


# ─── MCP / SOLO integration ───────────────────────────────────────────────────

def ensure_solo_mode():
    """Toggle SOLO mode on via MCP."""
    req = {
        "jsonrpc": "2.0", "id": "1", "method": "tools/call",
        "params": {"name": "start_solo_mode", "arguments": {}}
    }
    try:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(5)
        sock.connect(MCP_SOCKET)
        sock.sendall((json.dumps(req) + "\n").encode())
        resp = b""
        while True:
            chunk = sock.recv(4096)
            if not chunk:
                break
            resp += chunk
            try:
                sock.close()
                return json.loads(resp.decode())
            except Exception:
                continue
        sock.close()
    except Exception:
        return None


# ─── STT: MiniMax (cloud) ─────────────────────────────────────────────────────

def transcribe_minimax(audio_path):
    """
    Transcribe audio using MiniMax STT API.
    Requires: MINIMAX_API_KEY environment variable.
    """
    import requests

    api_key = os.environ.get("MINIMAX_API_KEY", "")
    if not api_key:
        # Try loading from .env in the script's directory
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    if line.startswith("MINIMAX_API_KEY="):
                        api_key = line.split("=", 1)[1].strip().strip('"').strip("'")

    if not api_key:
        print("❌ MINIMAX_API_KEY not set. Set it in environment or .env file.")
        print("   Example: export MINIMAX_API_KEY=your_key_here")
        return None

    url = "https://api.minimaxi.chat/v1/speech_to_text"
    headers = {"Authorization": f"Bearer {api_key}"}

    with open(audio_path, "rb") as f:
        files = {"audio": (os.path.basename(audio_path), f, "audio/wav")}
        try:
            resp = requests.post(url, headers=headers, files=files, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            return data.get("text", "").strip()
        except Exception as e:
            print(f"MiniMax STT error: {e}")
            return None


# ─── STT: Whisper (local / offline) ──────────────────────────────────────────

def transcribe_whisper(audio_path, model_size="base"):
    """
    Transcribe audio using local OpenAI Whisper model.
    
    Fully offline — no API key needed.
    
    Args:
        audio_path: Path to audio file (wav, mp3, m4a, etc.)
        model_size: Whisper model size: tiny, base, small, medium, large
                    'base' is a good balance of speed and accuracy (~140MB)
    
    Returns:
        Transcribed text or None on failure.
    
    Install:
        pip install openai-whisper
        # Also needs ffmpeg: sudo apt-get install ffmpeg
    """
    try:
        import whisper
    except ImportError:
        print("❌ openai-whisper not installed.")
        print("   Install with: pip install openai-whisper")
        print("   (Also needs ffmpeg: sudo apt-get install ffmpeg)")
        return None

    if not os.path.exists(audio_path):
        print(f"❌ Audio file not found: {audio_path}")
        return None

    print(f"🎙️  Loading Whisper model '{model_size}'...")
    print("   (First run downloads the model, ~140MB for 'base')")

    try:
        model = whisper.load_model(model_size)
        print(f"🔊 Transcribing {audio_path}...")
        result = model.transcribe(audio_path)
        text = result.get("text", "").strip()
        print(f"✅ Whisper transcript: {text[:80]}{'...' if len(text) > 80 else ''}")
        return text
    except Exception as e:
        print(f"Whisper error: {e}")
        return None


# ─── Recording (ffmpeg) ───────────────────────────────────────────────────────

def record_audio(duration=5, output_path=None):
    """
    Record audio from microphone using ffmpeg.
    
    Args:
        duration: Recording duration in seconds
        output_path: Where to save the audio file (wav). If None, uses a temp file.
    
    Returns:
        Path to recorded audio file, or None on failure.
    """
    if not has_command("ffmpeg"):
        print("❌ ffmpeg not installed. Install: sudo apt-get install ffmpeg")
        return None

    if output_path is None:
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        output_path = tmp.name
        tmp.close()

    print(f"🎤 Recording {duration}s of audio... (speak now)")
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "alsa", "-i", "default",
                "-t", str(duration),
                "-ar", "16000", "-ac", "1",
                output_path
            ],
            timeout=duration + 5,
            capture_output=True,
            check=True
        )
        print(f"✅ Recorded to {output_path}")
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"❌ Recording failed: {e.stderr.decode()[:200]}")
        return None
    except Exception as e:
        print(f"❌ Recording error: {e}")
        return None


# ─── Main pipeline ────────────────────────────────────────────────────────────

def paste_to_solo():
    """Get clipboard text and paste/deliver into SOLO chat."""
    text = get_clipboard()
    if not text:
        print("⚠️  Clipboard empty. Use speech_to_solo.html to record first.")
        return False

    print(f"📋 Clipboard: {text[:80]}{'...' if len(text) > 80 else ''}")

    if not os.path.exists(MCP_SOCKET):
        print("⚠️  MCP socket not found. Delivering without SOLO mode toggle.")
        print("   (Start 'TRAE MCP: Start Server' in TRAE for full integration)")

    deliver_text(text)
    print("✅ Done!")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Voice → SOLO chat pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        "--use-whisper", action="store_true",
        help="Use local Whisper STT instead of MiniMax API (offline, no API key)"
    )
    parser.add_argument(
        "--whisper-model", default="base",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model size (default: base). Larger = more accurate but slower."
    )
    parser.add_argument(
        "--transcribe", metavar="AUDIO_FILE",
        help="Transcribe an audio file and deliver to SOLO"
    )
    parser.add_argument(
        "--record", metavar="SECONDS", type=int, default=0,
        help="Record from microphone for N seconds, then transcribe"
    )
    parser.add_argument(
        "--clipboard", action="store_true",
        help="Just show/paste current clipboard contents"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Transcribe only, don't deliver to SOLO"
    )

    args = parser.parse_args()

    # ── Show clipboard ──
    if args.clipboard:
        text = get_clipboard()
        if text:
            print(f"📋 Clipboard contents:\n{text}")
        else:
            print("⚠️  Clipboard is empty.")
        return

    # ── Detect STT method ──
    stt = detect_stt_method(prefer_whisper=args.use_whisper)
    clipboard_method = detect_clipboard_method()

    print(f"""
🎙️  Voice → SOLO Pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STT method:    {stt} {'(offline)' if stt == 'whisper' else '(cloud API)'}
Delivery:      {clipboard_method}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

    # ── Transcribe a given file ──
    if args.transcribe:
        audio_path = args.transcribe
        if stt == "whisper":
            text = transcribe_whisper(audio_path, model_size=args.whisper_model)
        else:
            text = transcribe_minimax(audio_path)

        if text:
            print(f"\n📝 Transcript:\n{text}\n")
            if not args.dry_run:
                deliver_text(text)
        return

    # ── Record from mic ──
    if args.record > 0:
        audio_path = record_audio(duration=args.record)
        if not audio_path:
            return

        if stt == "whisper":
            text = transcribe_whisper(audio_path, model_size=args.whisper_model)
        else:
            text = transcribe_minimax(audio_path)

        # Clean up temp file
        try:
            os.unlink(audio_path)
        except Exception:
            pass

        if text:
            print(f"\n📝 Transcript:\n{text}\n")
            if not args.dry_run:
                deliver_text(text)
        return

    # ── Default: browser-based workflow ──
    print("""How to use (browser-based recording):
  1. Open in browser:
     file:///home/ernest/.openclaw/workspace/workspace2/repos/Trae-Openclaw-Integration/speech_to_solo.html
  2. Click 'Hold to Speak' → record your voice
  3. Click 'Send to SOLO Chat' → transcript copies to clipboard
  4. Switch back here and press Enter, or this script auto-pastes (if xdotool available)

Tip: For fully offline STT, use:
  python3 voice_pipeline.py --record 5 --use-whisper
""")
    paste_to_solo()


if __name__ == "__main__":
    main()
