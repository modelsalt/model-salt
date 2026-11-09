# Changelog

## Unreleased

- **Claude Code plugin 1.0.3 is hosted.** The plugin now connects to https://modelsalt.com/mcp/listed instead of running `npx` on your machine, because the Claude plugin directory accepts local MCP servers only from verified organizations. Your request then goes to modelsalt.com and is not stored. `npx`, the other plugins and the MCPB bundle still run locally. No new npm release.
- **random.org is no longer used.** Its free terms cover personal, non-commercial use and development only. The physical source is now LfD's quantum random number service; the NIST Randomness Beacon is mixed in next to drand, hashed with local bytes and asked at most once a minute.

## 1.0.3

- **Keep what you like.** Say what to keep ("keep the palette and layout, give me new illustrations") and your model sends those decided answers in the new `keep` field. Only the open choices are rolled again, the reply starts with a `Kept:` line that carries over to later runs until you start fresh, and a kept answer that no longer fits the request is dropped and named. Nothing is stored. In a model-fit test Claude Opus 5.5 and GPT-6.1 Sol filled `keep` when asked to keep something and left it out on "something new", 21 of 21 runs each.

## 1.0.2

- **Works without Claude Code or Codex.** With neither CLI on the machine (a Docker container, Cursor or Copilot alone), the tool no longer returns "nothing was settled" every time: your model does the exploring step itself, in two calls of the tool (the request, then its reply with the `id` the first call gave). With a CLI, nothing changes. `SALT_IN_CONTEXT=1` forces the two calls, `0` the CLI.
- **Every install route on 1.0.2:** the Claude plugin pin, `server.json` (official MCP registry), the MCPB desktop bundle and the root `plugin.json`. The skill and the bundle's tool text now describe the second call.

## 1.0.1

- **Listed in the official MCP registry** as `com.modelsalt/model-salt` (`mcpName` in package.json, `server.json`). No change to the server.

## 1.0.0

The first public release.

- **One tool, `model_salt`,** for Claude Code, Codex, Gemini CLI and Kimi Code, with one `setup` command per client and `uninstall` to take it out.
- **Tested on six models:** Claude Opus 5.5, Claude Fable 5.1, GPT-6.1 Sol, GPT-6 Astra, Gemini 4 Argon and Kimi K3.
- **A randomness setting** from 0 to 2 for when you ask for more or less of it. Without one it runs at 1.
- **Two services:** `anthropic` for Claude models (and for now Gemini and Kimi), `openai` for GPT models.
