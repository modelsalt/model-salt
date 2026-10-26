#!/bin/zsh
# Protocol smoke test of every service on both transports: initialize, tools/list, tools/call, prompts/get, unknown method
S=${0:A:h:h}; port=${1:-6591}
msgs='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"model_salt","arguments":{"model":"test"}}}
{"jsonrpc":"2.0","id":4,"method":"prompts/get","params":{"name":"salt","arguments":{"task":"Write a haiku about autumn."}}}
{"jsonrpc":"2.0","id":5,"method":"nope"}'
q='{id, ok: (.error == null), name: .result.serverInfo.name, tools: [.result.tools[]?.name], seed: (.result.content[0].text // .result.messages[0].content.text // "" | .[0:70]), err: .error.code}'
for s in anthropic openai; do echo "== stdio $s"; print -r -- "$msgs" | node $S/src/stdio.mjs $s | jq -c $q; done
echo "== http"; node $S/src/serve-http.mjs $port > /dev/null & pid=$!; sleep 0.5
for s in anthropic openai; do print -r -- "$msgs" | while read -r m; do curl -s -X POST -H 'content-type: application/json' --data "$m" http://127.0.0.1:$port/$s/mcp | jq -c $q 2>/dev/null || echo "[no body]"; done; done
curl -s http://127.0.0.1:$port/; curl -s -o /dev/null -w 'GET /nope/mcp [%{http_code}]\n' http://127.0.0.1:$port/nope/mcp
kill $pid
