#!/usr/bin/env bash

set -euo pipefail

MODE="${1:-full}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
TARGET_DIR="$ROOT_DIR/ai-intel-studio/public/data"

copy_if_exists() {
  local src="$1"
  local dst="$2"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "synced: ${src#$ROOT_DIR/} -> ${dst#$ROOT_DIR/}"
  else
    echo "skip: ${src#$ROOT_DIR/} (not found)"
  fi
}

case "$MODE" in
  full)
    copy_if_exists "$DATA_DIR/collected/latest-24h.json" "$TARGET_DIR/collected/latest-24h.json"
    copy_if_exists "$DATA_DIR/collected/latest-7d.json" "$TARGET_DIR/collected/latest-7d.json"
    copy_if_exists "$DATA_DIR/collected/source-status.json" "$TARGET_DIR/collected/source-status.json"
    copy_if_exists "$DATA_DIR/ai-input/analysis-input-24h.json" "$TARGET_DIR/ai-input/analysis-input-24h.json"
    copy_if_exists "$DATA_DIR/ai-output-md/ai-analysis-24h.md" "$TARGET_DIR/ai-output-md/ai-analysis-24h.md"
    copy_if_exists "$DATA_DIR/emotion-input/latest-24h-emotion.json" "$TARGET_DIR/emotion-input/latest-24h-emotion.json"
    copy_if_exists "$DATA_DIR/emotion-input/source-status-emotion.json" "$TARGET_DIR/emotion-input/source-status-emotion.json"
    copy_if_exists "$DATA_DIR/emotion-output-md/latest-24h-emotion.md" "$TARGET_DIR/emotion-output-md/latest-24h-emotion.md"
    copy_if_exists "$DATA_DIR/emotion-output-md/emotion-analysis-24h.md" "$TARGET_DIR/emotion-output-md/emotion-analysis-24h.md"
    ;;
  analysis-only)
    copy_if_exists "$DATA_DIR/ai-input/analysis-input-24h.json" "$TARGET_DIR/ai-input/analysis-input-24h.json"
    copy_if_exists "$DATA_DIR/ai-output-md/ai-analysis-24h.md" "$TARGET_DIR/ai-output-md/ai-analysis-24h.md"
    ;;
  emotion-only)
    copy_if_exists "$DATA_DIR/emotion-input/latest-24h-emotion.json" "$TARGET_DIR/emotion-input/latest-24h-emotion.json"
    copy_if_exists "$DATA_DIR/emotion-input/source-status-emotion.json" "$TARGET_DIR/emotion-input/source-status-emotion.json"
    copy_if_exists "$DATA_DIR/emotion-output-md/latest-24h-emotion.md" "$TARGET_DIR/emotion-output-md/latest-24h-emotion.md"
    copy_if_exists "$DATA_DIR/emotion-output-md/emotion-analysis-24h.md" "$TARGET_DIR/emotion-output-md/emotion-analysis-24h.md"
    ;;
  *)
    echo "usage: $0 [full|analysis-only|emotion-only]"
    exit 1
    ;;
esac
