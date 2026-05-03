#!/bin/bash
set -e
cd /data/projects/antigravity-scribe

VSIX=antigravity-scribe-0.1.0.vsix
TARGET=~/Antigravity_Profiles/phoneiep/app_config/.antigravity/extensions/sciscend.antigravity-scribe-0.1.0

npm run package
rm -rf $TARGET
mkdir -p $TARGET
unzip -q $VSIX -d $TARGET
mv $TARGET/extension/* $TARGET/
rm -rf $TARGET/extension $TARGET/\[Content_Types\].xml $TARGET/extension.vsixmanifest
echo "✓ Installed — reload Antigravity window"