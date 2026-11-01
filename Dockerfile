# Model Salt as a container: the same stdio MCP server as `npx -y @modelsalt/model-salt`, for Docker's MCP catalog.
#   docker build -t model-salt .
#   docker run -i --rm model-salt            # Claude's steps (anthropic), for Claude, Gemini and Kimi models
#   docker run -i --rm model-salt openai     # GPT's steps
# It has no dependencies and needs no API key; it fetches only random bytes over HTTPS (see PRIVACY.md).
FROM node:22-alpine
WORKDIR /app
COPY package.json CHANGELOG.md LICENSE ./
COPY src ./src
COPY services ./services
COPY plugin/skills ./plugin/skills
USER node
ENTRYPOINT ["node", "src/stdio.mjs"]
CMD ["anthropic"]
