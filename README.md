<h1 align="center">jiraclaw</h1>

<p align="center">
  <strong>CLI for Jira and Tempo. You can type normal English for some flows; ZeroClaw must be installed and set up on your machine.</strong>
</p>

<p align="center">
  <a href="https://github.com/stackblogger/jiraclaw/actions/workflows/semgrep.yml"><img src="https://github.com/stackblogger/jiraclaw/actions/workflows/semgrep.yml/badge.svg" alt="Semgrep" /></a>
  <a href="https://www.npmjs.com/package/jiraclaw"><img src="https://img.shields.io/npm/l/jiraclaw" alt="License" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" /></a>
</p>

## What you need

- Node.js 22.14 or newer
- [ZeroClaw](https://www.npmjs.com/package/zeroclaw) on your PATH (`npm i -g zeroclaw@latest`), then run its onboard / model setup so `zeroclaw` works
- Jira API token: [Atlassian → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- Tempo API token from your Tempo / Atlassian admin (same kind of bearer token you use for Tempo Cloud API)

## Install

```bash
npm i -g jiraclaw
```

From this repo (for development):

```bash
npm install && npm run build && npm link
```

## Env vars that `jiraclaw config` does **not** set

`jiraclaw config` only saves Jira base URL, Tempo base URL, and (optional) encrypted Jira/Tempo tokens under `~/.jiraclaw/`. It does **not** set your Jira login email or the passphrase for the encrypted file. Those have to come from the environment (or a `.env` file in the folder where you run the command — jiraclaw loads `.env` from current working directory).

Put these in `~/.zshrc`, `~/.bashrc`, or export them in the terminal before you run jiraclaw:

```bash
export JIRA_EMAIL="your-atlassian-email@example.com"
```

If you use `jiraclaw config set-jira-token` or `set-tempo-token`, you **must** also set a passphrase (same value every time you run jiraclaw so it can read the encrypted file):

```bash
export JIRACLAW_SECRET="choose-a-long-passphrase-and-do-not-share-it"
```

If `zeroclaw` is not on your PATH or you use a custom name/path:

```bash
export ZEROCLAW_BIN="/full/path/to/zeroclaw"
```

Optional overrides (env wins over values saved by `jiraclaw config`):

```bash
export JIRA_BASE_URL="https://your-site.atlassian.net"
export JIRA_API_TOKEN="..."
export TEMPO_BASE_URL="https://api.tempo.io/4"
export TEMPO_API_TOKEN="..."
```

After editing your shell config, run `source ~/.zshrc` (or open a new terminal).

## Saving URLs and tokens with jiraclaw (optional)

Only works if `JIRACLAW_SECRET` is exported (see above).

```bash
jiraclaw config set-jira-url https://your-site.atlassian.net
jiraclaw config set-tempo-url https://api.tempo.io/4
jiraclaw config set-jira-token YOUR_JIRA_API_TOKEN
jiraclaw config set-tempo-token YOUR_TEMPO_TOKEN
```

Tokens are stored encrypted; jiraclaw does not print them back.

## Commands

```bash
jiraclaw
```

Opens the interactive menu.

```bash
jiraclaw today
jiraclaw search 'assignee = currentUser() AND updated >= -7d'
```

English-style commands (ZeroClaw plans the steps; you get confirmations before Tempo writes):

```bash
jiraclaw add today's hours in tempo
jiraclaw log my work
jiraclaw create jira task for API cleanup
jiraclaw update ABC-123 status to In Progress
```

## License

MIT
