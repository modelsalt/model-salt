# Privacy

Model Salt runs on your own machine. It has no account, no analytics and no telemetry.

- **Your prompts stay with you.** The tool reads your request on your machine to pick what to settle. It never sends your request, your files or your answers anywhere.
- **Where the randomness comes from.** To get random bytes, the server asks public random sources over HTTPS: random.org, the LfD quantum random number service (OTH Regensburg) and the drand beacon. Those requests carry only what any web request carries (your IP address) and the user agent `model-salt`. They ask for numbers, nothing else.
- **No data is kept.** Model Salt stores nothing about you. The random sources have their own privacy terms.

Questions: open an issue at https://github.com/modelsalt/model-salt/issues.
