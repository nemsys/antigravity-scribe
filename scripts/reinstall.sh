#!/bin/bash
cd /data/projects/antigravity-scribe

npm run package && \
rm -rf ~/Antigravity_Profiles/phoneiep/app_config/.antigravity/extensions/sciscend.antigravity-scribe-0.1.0 && \
cp -r ~/.vscode/extensions/sciscend.antigravity-scribe-0.1.0 \
  ~/Antigravity_Profiles/phoneiep/app_config/.antigravity/extensions/ && \
echo "✓ Installed — reload Antigravity window"