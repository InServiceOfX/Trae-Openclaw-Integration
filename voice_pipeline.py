#!/usr/bin/env python3
"""
voice_pipeline.py — Voice → paste to SOLO chat

Usage:
    python3 voice_pipeline.py           # Paste clipboard to SOLO
    python3 voice_pipeline.py --clipboard  # Just paste clipboard
    python3 voice_pipeline.py --help       # This help

How it works:
    1. Open speech_to_solo.html in browser
    2. Click 'Hold to Speak' → record your voice
    3. Click 'Send to SOLO Chat' → copies to clipboard
    4. Run: python3 voice_pipeline.py → pastes to SOLO chat
    5. Press Enter in SOLO to send

Requires: ffmpeg (for recording), tkinter (for clipboard), xdotool (for auto-paste)
"""

import subprocess
import os
import sys
import json
import socket

MCP_SOCKET = "/tmp/trae-openclaw-mcp.sock"


def get_clipboard():
    """Get current clipboard text using tkinter."""
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        text = root.clipboard_get()
        root.destroy()
        return text.strip()
    except Exception as e:
        return ""


def paste_via_xdotool(text):
    """Type text directly using xdotool into the focused window (SOLO chat)."""
    import time
    
    # Ensure SOLO mode first
    ensure_solo_mode()
    time.sleep(0.5)
    
    try:
        # Type the text into the focused window
        subprocess.run(['xdotool', 'type', '--clearmodifiers', '--', text],
                       timeout=15, check=False)
        return True
    except Exception as e:
        print(f"xdotool error: {e}")
        return False


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
            if not chunk: break
            resp += chunk
            try: 
                sock.close()
                return json.loads(resp.decode())
            except: continue
        sock.close()
    except: return None


def paste_to_solo():
    """Get clipboard text and paste into SOLO chat."""
    text = get_clipboard()
    if not text:
        print("⚠️  Clipboard empty. Use speech_to_solo.html to record first.")
        return False
    
    print(f"📋 Clipboard: {text[:60]}...")
    
    if not os.path.exists(MCP_SOCKET):
        print("❌ MCP socket not found. Start 'TRAE MCP: Start Server' in TRAE first.")
        return False
    
    paste_via_xdotool(text)
    print("✅ Pasted to SOLO chat!")
    print("   Press Enter in SOLO to send.")
    return True


def main():
    if len(sys.argv) > 1 and sys.argv[1] == '--help':
        print(__doc__)
        return
    
    if len(sys.argv) > 1 and sys.argv[1] == '--clipboard':
        text = get_clipboard()
        if text:
            print(f"📋 Clipboard: {text}")
        else:
            print("⚠️  Clipboard empty")
        return
    
    print("""
🎙️  Voice → SOLO Pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Open in browser:
   file:///home/ernest/.openclaw/workspace/workspace2/repos/Trae-Openclaw-Integration/speech_to_solo.html
2. Click 'Hold to Speak' → record your voice
3. Click 'Send to SOLO Chat'
4. Then run: python3 voice_pipeline.py
━━━━━━━━━━━━━━━━━━━━━━━━━━
""")
    paste_to_solo()


if __name__ == "__main__":
    main()

