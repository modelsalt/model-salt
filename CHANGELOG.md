# Changelog

## 1.0.0

The first public release.

- **One tool, `model_salt`,** for Claude Code, Codex, Gemini CLI and Kimi Code, with one `setup` command per client and `uninstall` to take it out.
- **Tested on six models:** Claude Opus 5.5, Claude Fable 5.1, GPT-6.1 Sol, GPT-6 Astra, Gemini 4 Argon and Kimi K3.
- **A randomness setting** from 0 to 2 for when you ask for more or less of it. Without one it runs at 1.
- **Two services:** `anthropic` for Claude models (and for now Gemini and Kimi), `openai` for GPT models.
