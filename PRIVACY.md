# Privacy

Run with `npx`, the Codex or Gemini plugin or the MCPB bundle, Model Salt runs on your own machine. It has no account, no analytics and no telemetry.

- **Your prompts stay with you.** The tool reads your request on your machine to pick what to settle. It never sends your request, your files or your answers anywhere.
- **The Claude Code plugin and the hosted endpoint are different.** Since plugin 1.0.3 the Claude Code plugin connects to the hosted server at https://modelsalt.com/mcp/listed, the same one the ChatGPT app and the Claude connector use. There your request and your model's reply to the exploring step are sent to modelsalt.com. They are not stored or logged; only anonymous hourly counts are kept. Details: https://modelsalt.com/privacy.
- **Where the randomness comes from.** To get random bytes, the server asks public random sources over HTTPS: the LfD quantum random number service (OTH Regensburg), the drand beacon and the NIST Randomness Beacon. Those requests carry only what any web request carries (your IP address) and the user agent `model-salt`. They ask for numbers, nothing else.
- **No data is kept.** Model Salt stores nothing about you. The random sources have their own privacy terms.

Questions: open an issue at https://github.com/modelsalt/model-salt/issues.
