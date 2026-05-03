#!/bin/bash
set -e
cd /data/projects/antigravity-scribe

npm run package

HOME="/home/nemsys/Antigravity_Profiles/phoneiep/app_config" \
  antigravity \
  --extensions-dir="/home/nemsys/Antigravity_Profiles/phoneiep/app_config/.antigravity/extensions" \
  --install-extension /data/projects/antigravity-scribe/antigravity-scribe-0.1.0.vsix

echo "✓ Installed — reload Antigravity window"