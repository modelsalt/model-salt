# Privacy

Run with `npx`, the Codex or Gemini plugin or the MCPB bundle, Model Salt runs on your own machine. It has no account, no analytics and no telemetry.

- **Your prompts stay with you.** The tool reads your request on your machine to pick what to settle. It never sends your request, your files or your answers anywhere.
- **The Claude Code plugin and the hosted endpoint are different.** Since plugin 1.0.3 the Claude Code plugin connects to the hosted server at https://modelsalt.com/mcp/listed, the same one the ChatGPT app and the Claude connector use. Since 19 November 2026 that server is sent only how many options each open choice has (a list such as `[5, 5, 5, 5, 5]`). Your request, the options your model writes and the rest of the chat are not sent, and anything else an app attaches to the call is not read. Nothing of a call is stored or logged; only anonymous hourly counts are kept. Details: https://modelsalt.com/privacy.
- **Where the randomness comes from.** To get random bytes, the server asks public random sources over HTTPS: the LfD quantum random number service (OTH Regensburg), the drand beacon and the NIST Randomness Beacon. Those requests carry only what any web request carries (your IP address) and the user agent `model-salt`. They ask for numbers, nothing else.
- **No data is kept.** Model Salt stores nothing about you. The random sources have their own privacy terms.

Questions: open an issue at https://github.com/modelsalt/model-salt/issues.
