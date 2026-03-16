# Project: Vamoos MCP Project v1

## Repos

Both repos are always relevant and available locally:

| Repo | Local path | Purpose |
|------|-----------|---------|
| `claude-code-chatbot-v1` | `/home/user/claude-code-chatbot-v1` | React chat UI + Netlify function |
| `remote-mcp-server-authless` | `/home/user/remote-mcp-server-authless` | Cloudflare Workers MCP server |

## GitHub Access

Personal token for pushing to GitHub directly (needed because the task proxy blocks pushes to `main`/`master`).

The user will provide the token at the start of each session, or store it as `GITHUB_TOKEN` in the environment.

Usage:
```bash
git push https://<token>@github.com/ianball99/<repo>.git <branch>
```

## Stack

- **claude-code-chatbot-v1**: React (Vite), deployed on Netlify. Chat UI calls `/.netlify/functions/chat` which proxies to Anthropic API and the MCP server.
- **remote-mcp-server-authless**: Cloudflare Workers + Durable Objects, deployed via `wrangler deploy`. Exposes MCP tools for managing Vamoos travel itineraries.

## Deployment

- **Chatbot**: Auto-deploys on push to `main`. Netlify function handles Claude API + MCP calls.
- **MCP server**: Manual deploy via `wrangler deploy` from `remote-mcp-server-authless`.
- **Netlify branch**: Only `main` triggers deploys — always merge `claude/` branches to `main` promptly.

## Branch Workflow

The task system creates `claude/...` branches and blocks pushes to `main`/`master` via the proxy. Workflow:
1. Work on `claude/` branch
2. Merge to `main`/`master` locally
3. Push `main`/`master` using the GitHub token above
4. Delete the `claude/` branch (remote + local)

## Gotchas

- **netlify.toml**: Do NOT add `timeout` under `[functions]` — it causes a Netlify TOML parse failure. The Puppeteer PDF tool that needed it has been retired.
- **upload_created_html_itinerary_document**: Handled server-side by the MCP worker. It is NOT in `UPLOAD_TOOLS` in `chat.js` and does not need client-side handling in `App.jsx`.
- **legacy_upload_created_itinerary_document**: Retired tool in the MCP server. Do not re-enable or reference it.

## Working Style

- Always play back a proposed plan and get confirmation before taking action
- Don't guess — if unsure, ask
- If more info is needed, ask for it
- Always ensure actions can easily be undone
