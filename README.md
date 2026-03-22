# tsk — Circles Tasks

Unified task management CLI. One interface for multiple task/issue tracking services.

## Supported Sources

- **Jira** (current)
- GitHub Issues / Projects (planned)
- Asana (planned)
- Google Tasks (planned)
- Apple Reminders (planned)

## Install

```bash
npm install -g @circlesac/tsk
```

## Usage

```bash
# Jira attachment operations (uses acli token from Keychain)
tsk jira attach list SHMV-2464
tsk jira attach download SHMV-2464
tsk jira attach download SHMV-2464 --id 20192
```

## Authentication

`tsk` reuses the acli Jira token stored in macOS Keychain. If acli is authenticated with an API token (`acli jira auth login --token`), attachment downloads will work without additional setup.

```bash
# Ensure acli is logged in with API token (not OAuth)
echo "YOUR_API_TOKEN" | acli jira auth login --site "your-site.atlassian.net" --email "you@email.com" --token
```

## License

MIT
