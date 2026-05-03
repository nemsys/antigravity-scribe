#!/bin/bash
set -e
cd /data/projects/antigravity-scribe

npm run package
ag-phoneiep --install-extension /data/projects/antigravity-scribe/antigravity-scribe-0.1.0.vsix
echo "✓ Installed — reload Antigravity window"