#!/bin/bash
# ============================================================
# install-deps.sh — Install system + Python deps for voice_pipeline
# Usage: bash scripts/install-deps.sh
# ============================================================

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Trae-Openclaw Voice Pipeline — Dependency Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ─── System packages ───────────────────────────────────────
echo "📦 Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y \
    xclip \
    xdotool \
    ffmpeg \
    python3-pip \
    python3-venv

echo ""
echo "✅ System packages installed."
echo ""

# ─── Python packages ───────────────────────────────────────
echo "🐍 Installing Python packages..."

# Check if pip is available
if command -v pip3 &>/dev/null; then
    PIP=pip3
elif python3 -m pip --version &>/dev/null 2>&1; then
    PIP="python3 -m pip"
else
    echo "⚠️  pip not found. Install python3-pip first:"
    echo "    sudo apt-get install python3-pip"
    exit 1
fi

echo "Using: $PIP"
echo ""

# Core dependencies
$PIP install requests

# Whisper (optional — large download ~140MB for 'base' model)
echo ""
echo "Install openai-whisper for offline STT? (y/N)"
read -r INSTALL_WHISPER
if [[ "$INSTALL_WHISPER" =~ ^[Yy]$ ]]; then
    echo "Installing openai-whisper (may take a while)..."
    $PIP install openai-whisper
    echo "✅ Whisper installed. First run will download the model (~140MB)."
else
    echo "⏭️  Skipping whisper. Use --use-whisper flag later after installing:"
    echo "    pip install openai-whisper"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Installation complete!"
echo ""
echo "Test the pipeline:"
echo "    python3 voice_pipeline.py --help"
echo ""
echo "Try offline STT:"
echo "    python3 voice_pipeline.py --record 5 --use-whisper"
echo ""
echo "Set MiniMax API key (for cloud STT):"
echo "    export MINIMAX_API_KEY=your_key_here"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
