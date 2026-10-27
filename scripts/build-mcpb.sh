#!/bin/sh
# Builds dist/model-salt-<version>.mcpb, the desktop extension bundle for Claude Desktop, Anthropic's directory and Smithery:
# the files npm publishes (npm pack) plus mcpb/manifest.json and mcpb/icon.png, through the official mcpb CLI.
#   sh scripts/build-mcpb.sh
set -e
cd "$(dirname "$0")/.."
v=$(node -p "require('./package.json').version")
b=$(mktemp -d)
npm pack --silent --pack-destination "$b" >/dev/null
tar xzf "$b"/*.tgz -C "$b" && rm "$b"/*.tgz
node -e "const m=require('./mcpb/manifest.json');m.version='$v';require('fs').writeFileSync('$b/package/manifest.json',JSON.stringify(m,null,2))"
cp mcpb/icon.png "$b/package/icon.png"
npx -y @anthropic-ai/mcpb validate "$b/package/manifest.json"
mkdir -p dist
npx -y @anthropic-ai/mcpb pack "$b/package" "dist/model-salt-$v.mcpb"
rm -rf "$b"
echo "dist/model-salt-$v.mcpb"
