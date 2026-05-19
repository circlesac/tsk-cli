# tsk — Circles Tasks

Unified task management CLI. One interface for multiple task/issue tracking services.

## Supported Sources

- **Jira** (current) — acli token
- **GitHub Projects v2** (current) — browser session cookies + `gh` PAT
- Asana (planned)
- Google Tasks (planned)
- Apple Reminders (planned)

Scope rule: tsk only implements operations the official tool can't do. e.g. for GitHub, tsk wraps the internal `/memexes/` endpoint (view update/delete/extended config) — read operations defer to `gh api graphql`.

## Install

```bash
npm install -g @circlesac/tsk
# or
brew install circlesac/tap/tsk
```

## Usage

### Jira

```bash
tsk jira attach list SHMV-2464
tsk jira attach download SHMV-2464
tsk jira attach download SHMV-2464 --id 20192
```

### GitHub Projects v2

```bash
# Auth (extracts cookies from default Chromium browser)
tsk github auth login
tsk github auth status

# View operations (fills gaps in gh — gh covers read/basic-create only)
tsk github project view create <org> <project> --name X --layout roadmap --filter "type:Epic"
tsk github project view update <org> <project> <view#> --name Y --filter "..."
tsk github project view delete <org> <project> <view#>
```

For read (`view list`), use `gh api graphql`:

```bash
gh api graphql -f query='query { organization(login:"...") { projectV2(number:N) { views(first:50) { nodes { number name layout filter } } } } }'
```

## Authentication

### Jira

Reuses the acli Jira token stored in macOS Keychain. If acli is authenticated with an API token (`acli jira auth login --token`), tsk Jira commands work without additional setup.

```bash
echo "YOUR_API_TOKEN" | acli jira auth login --site "your-site.atlassian.net" --email "you@email.com" --token
```

### GitHub

Extracts session cookies from a Chromium browser (Chrome / Comet / Arc / Edge / Brave / Chromium) — default-browser priority, falls back to others. AES-128-CBC decryption via macOS Keychain Safe Storage. macOS only for now.

```bash
# Make sure you're logged in to github.com in your default browser, then:
tsk github auth login
```

Read commands additionally need `gh auth login` (PAT) — `tsk github project view update` calls `gh api graphql` internally to read current view state.

## License

MIT
