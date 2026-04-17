---
name: tsk
description: Reference guide for the tsk CLI — Jira issue, comment, and attachment operations (including custom fields that acli cannot read)
---

# tsk CLI Reference

`tsk` is a unified task management CLI. It currently supports **Jira**, reusing the acli Jira token from macOS Keychain — no separate auth.

## When to use tsk vs acli

- **acli** — general Jira browsing, workitem create/transition, standard fields
- **tsk** — when you need **custom fields** (Key details), comments with `@email` mentions, or attachment downloads. acli cannot read Jira custom fields.

## Authentication

Reuses acli's Jira token from macOS Keychain. Verify with:

```bash
acli jira auth status
```

If acli is not logged in:

```bash
echo "YOUR_API_TOKEN" | acli jira auth login --site "your-site.atlassian.net" --email "you@email.com" --token
```

## Issues

```bash
# View an issue with custom fields (Key details section)
tsk jira issue view --key SVOC-537

# Raw JSON output (includes `names` map for custom field IDs → labels)
tsk jira issue view --key SVOC-537 --json
```

Output includes standard fields (Status, Type, Assignee, Labels, etc.), **custom fields resolved to their display names** (계정정보, 서비스/제품명, 처리 주체, etc.), and the description as plain text.

Use `--json` when you need raw field values (e.g. to pipe into `jq`).

## Comments

```bash
# List comments
tsk jira comment list --key SHMV-2464
tsk jira comment list --key SHMV-2464 --json

# Add — body is standard markdown (bold, lists, code blocks, tables)
tsk jira comment add --key SHMV-2464 --body "**Fixed** — deployed to stage"

# Mentions: use @email or @accountId
tsk jira comment add --key SHMV-2464 --body "cc @alice@example.com please review"
tsk jira comment add --key SHMV-2464 --body "cc @712020:a1b2c3d4-... please review"

# Update / delete
tsk jira comment update --key SHMV-2464 --id 12345 --body "Updated text"
tsk jira comment delete --key SHMV-2464 --id 12345
```

Markdown is converted to ADF (Atlassian Document Format) automatically via `marklassian`.

## Attachments

```bash
# List
tsk jira attachment list --key SHMV-2464
tsk jira attachment list --key SHMV-2464 --json

# Download all attachments to ./SHMV-2464/
tsk jira attachment download --key SHMV-2464

# Download a specific attachment by ID
tsk jira attachment download --key SHMV-2464 --id 20192

# Custom output directory (files go to <out>/<key>/)
tsk jira attachment download --key SHMV-2464 --out /tmp
```

## Common workflows

### Get a custom field value programmatically

```bash
# e.g. extract 계정정보 from a VOC ticket
tsk jira issue view --key SVOC-537 --json | jq -r '.fields | with_entries(select(.key | startswith("customfield_")))'
```

### VOC investigation flow

```bash
tsk jira issue view --key SVOC-537                 # read Key details (phone, address, model)
tsk jira attachment download --key SVOC-537        # grab screenshots/logs
tsk jira comment list --key SVOC-537               # prior correspondence
tsk jira comment add --key SVOC-537 --body "..."   # reply
```
