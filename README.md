# clawj

CLI for **Jira**, **Tempo**, and local dev context. Planning and summaries call **ZeroClaw** (`zeroclaw agent -m "…"`); Jira/Tempo run locally with your credentials.

## Requirements

- **Node.js** ≥ 22.14 (uses built-in `node:sqlite`)
- **ZeroClaw** CLI on your PATH (recommended: `npm install -g zeroclaw@latest`) and a working model config (`zeroclaw onboard`, etc.)
- Optional: override binary with `ZEROCLAW_BIN=/path/to/zeroclaw`

## Install (local / dev)

```bash
git clone <repo> && cd clawj-local
npm install
npm run build
npm link   # or: node dist/cli/bootstrap.js
```

## Global npm install

```bash
npm install -g clawj
```

Publish: bump `version` in `package.json`, `npm login`, `npm publish --access public`.

## Environment

| Variable | Purpose |
|----------|---------|
| `JIRA_BASE_URL` | e.g. `https://your-domain.atlassian.net` |
| `JIRA_EMAIL` | Atlassian account email |
| `JIRA_API_TOKEN` | [API token](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `TEMPO_API_TOKEN` | Tempo Cloud bearer token |
| `TEMPO_BASE_URL` | Default `https://api.tempo.io/4` |
| `CLAWJ_SECRET` | Passphrase for encrypted token store under `~/.clawj/secrets.enc` |
| `ZEROCLAW_BIN` | Optional path/name for ZeroClaw executable |

`.env` in the current directory is loaded automatically.

## Encrypted token storage

1. Choose a strong `CLAWJ_SECRET` in your environment.
2. Run:

```bash
clawj config set-jira-url https://your.atlassian.net
clawj config set-jira-token YOUR_JIRA_API_TOKEN
clawj config set-tempo-token YOUR_TEMPO_TOKEN
```

Tokens are encrypted at rest; they are **never** printed by `clawj`.

## Usage

Interactive menu:

```bash
clawj
```

Natural language (ZeroClaw classifies intent; you confirm before Tempo writes):

```bash
clawj add today's hours in tempo
clawj log my work
clawj create jira task for API optimization
clawj update ABC-123 status to In Progress
```

Other commands:

```bash
clawj today
clawj search 'assignee = currentUser() AND updated >= -7d'
```

## Architecture

```text
src/
  agent/       ZeroClaw subprocess + plan parsing
  cli/         Commander bootstrap + interactive menu
  commands/    Jira/Tempo flows + confirmations
  config/      ~/.clawj config + encrypted secrets
  jira/        REST v3 client
  tempo/       REST v4 client
  memory/      SQLite (node:sqlite)
  tracking/    git + cwd context
  prompts/     planner strings
  tools/       re-exports for future tool plugins
```

## Tempo worklog flow

1. Resolve Jira `accountId` via `GET /rest/api/3/myself`
2. Resolve numeric `issueId` via `GET /rest/api/3/issue/{key}`
3. Show confirmation (ticket, issue id, hours, summary)
4. On **y**, `POST` Tempo worklog with `authorAccountId` + `issueId`

## Limitations / next steps

- Tempo/Jira response shapes vary by host; adjust `src/tempo/client.ts` if your Tempo base URL is Jira-plugin style.
- ZeroClaw must return parseable JSON for planner intents; heuristics apply on parse failure.
- Slack/GitHub/notifications/scheduler: hooks reserved in `src/tools/index.ts` pattern.

## License

MIT
