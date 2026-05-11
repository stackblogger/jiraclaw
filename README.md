<h1 align="center">jiraclaw</h1>

<p align="center">
  <strong>a lightweight CLI to automate your manual jira tickets management and tempo hours logging.</strong>
</p>

<p align="center">
  <a href="https://github.com/stackblogger/jiraclaw/actions/workflows/semgrep.yml"><img src="https://github.com/stackblogger/jiraclaw/actions/workflows/semgrep.yml/badge.svg" alt="Semgrep" /></a>
  <a href="https://www.npmjs.com/package/jiraclaw"><img src="https://img.shields.io/npm/l/jiraclaw" alt="License" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>


## Requirements

- **Node.js** ≥ 22.14 (uses built-in `node:sqlite`)
- **ZeroClaw** CLI on your PATH (recommended: `npm install -g zeroclaw@latest`) and a working model config (`zeroclaw onboard`, etc.)
- Optional: override binary with `ZEROCLAW_BIN=/path/to/zeroclaw`

## Install (local / dev)

```bash
git clone https://github.com/stackblogger/jiraclaw.git && cd jiraclaw
npm install
npm run build
npm link   # or: node dist/cli/bootstrap.js
```

## Global npm install

```bash
npm install -g jiraclaw
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
| `JIRACLAW_SECRET` | Passphrase for encrypted token store under `~/.jiraclaw/secrets.enc` |
| `ZEROCLAW_BIN` | Optional path/name for ZeroClaw executable |

`.env` in the current directory is loaded automatically.

## Encrypted token storage

1. Choose a strong `JIRACLAW_SECRET` in your environment.
2. Run:

```bash
jiraclaw config set-jira-url https://your.atlassian.net
jiraclaw config set-jira-token YOUR_JIRA_API_TOKEN
jiraclaw config set-tempo-token YOUR_TEMPO_TOKEN
```

Tokens are encrypted at rest; they are **never** printed by `jiraclaw`.

## Usage

Interactive menu:

```bash
jiraclaw
```

Natural language (ZeroClaw classifies intent; you confirm before Tempo writes):

```bash
jiraclaw add today's hours in tempo
jiraclaw log my work
jiraclaw create jira task for API optimization
jiraclaw update ABC-123 status to In Progress
```

Other commands:

```bash
jiraclaw today
jiraclaw search 'assignee = currentUser() AND updated >= -7d'
```

## Architecture

```text
src/
  agent/       ZeroClaw subprocess + plan parsing
  cli/         Commander bootstrap + interactive menu
  commands/    Jira/Tempo flows + confirmations
  config/      ~/.jiraclaw config + encrypted secrets
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
