---
name: tsk
description: Operate the tsk CLI for Jira custom fields, comments, and attachments, or for GitHub Projects v2 gaps that gh does not expose, including Issue Types, extended view management, field options, bulk item edits, status updates, workflows, and charts. Use when agents need exact tsk commands, authentication diagnostics, JSON output, or safety guidance for unofficial GitHub /memexes/ operations.
---

# tsk CLI Reference

Use `tsk` only for capabilities missing from the official platform CLI.

- Use `acli` for ordinary Jira browsing, creation, transition, and standard fields.
- Use `tsk jira` for Jira custom fields, Markdown comments with mentions, and attachment downloads.
- Use `gh` for ordinary GitHub issue, pull request, and Project operations.
- Use `tsk github` for Issue Types and Project v2 operations that `gh` does not expose or only handles one item at a time.

## Authentication

### Jira

`tsk` reads the current `acli` Jira profile and token from macOS Keychain. Do not create a separate `tsk` Jira credential.

```bash
acli jira auth status
```

If the token is missing, use the normal `acli jira auth login --token` flow before running `tsk jira`.

### GitHub

GitHub support uses two credential paths:

- Browser session cookies for unofficial GitHub web `/memexes/` operations such as view, workflow, chart, and item-position changes.
- A GitHub API token captured from `gh` for GraphQL reads and mutations such as Issue Types, fields, bulk field values, and status updates.

```bash
gh auth status
tsk github auth login
tsk github auth status
```

Current authentication code declares Google Chrome, Chromium, Comet, Arc, Edge, and Brave support, but searches fixed default profile paths. A valid session in `Profile 1` or another non-default profile may therefore be missed during fresh login. Treat this as profile discovery failure, not proof that the user is logged out, and do not manually expose or paste cookie values while diagnosing it.

`tsk github auth status` proves only that cached credentials exist. Run a real read command such as workflow or chart listing to prove that the browser session still works.

## Jira

### Read an Issue with Custom Fields

```bash
tsk jira issue view --key SVOC-537
tsk jira issue view --key SVOC-537 --json
```

Use `--json` when extracting custom fields programmatically. The response includes the Jira `names` map needed to resolve `customfield_*` IDs.

```bash
tsk jira issue view --key SVOC-537 --json \
  | jq -r '.fields | with_entries(select(.key | startswith("customfield_")))'
```

### Read and Write Comments

```bash
tsk jira comment list --key SHMV-2464
tsk jira comment list --key SHMV-2464 --json
tsk jira comment add --key SHMV-2464 --body "**Fixed** — deployed to stage"
tsk jira comment update --key SHMV-2464 --id 12345 --body "Updated text"
tsk jira comment delete --key SHMV-2464 --id 12345
```

Use `@email` or `@accountId` inside the Markdown body for Jira mentions. `tsk` resolves mentions and converts Markdown to Atlassian Document Format.

### Read and Download Attachments

```bash
tsk jira attachment list --key SHMV-2464
tsk jira attachment list --key SHMV-2464 --json
tsk jira attachment download --key SHMV-2464
tsk jira attachment download --key SHMV-2464 --id 20192
tsk jira attachment download --key SHMV-2464 --out /tmp
```

Downloads go to `<output>/<issue-key>/`. Verify file names and hashes before treating an attachment download as complete.

## GitHub Issue Types

Issue Types are organization-level resources. Do not create or delete a type merely for testing in an organization that lacks a designated test space.

```bash
tsk github issue-type list circlesac
tsk github issue-type list circlesac --json
tsk github issue-type create circlesac Epic --color PURPLE
tsk github issue-type update circlesac Epic --new-name Initiative --color BLUE
tsk github issue-type delete circlesac Initiative
```

Assign an existing Issue Type to one issue or a filtered repository set:

```bash
tsk github issue type-set owner/repo#42 Epic
tsk github issue type-set owner/repo Epic --bulk --state OPEN --label roadmap
```

## GitHub Project Views

Extended view creation, update, and deletion use GitHub's unofficial `/memexes/` endpoint.

```bash
tsk github project view create circlesac 1 --name Roadmap --layout roadmap --filter "is:open"
tsk github project view update circlesac 1 3 --name "Updated Roadmap" --filter "is:open type:Epic"
tsk github project view delete circlesac 1 3
```

View updates use a full-replacement endpoint. `tsk` preserves group, sort, vertical-group, and visible-field state it can read, but slice, layout settings, and aggregation settings are not all available through GraphQL. Re-specify settings that must not be lost and read the view back after updating it.

## GitHub Project Fields and Options

```bash
tsk github project field list circlesac 1
tsk github project field list circlesac 1 --json
tsk github project field create circlesac 1 --name Score --type number
tsk github project field update circlesac 1 Score --name PriorityScore
tsk github project field option-add circlesac 1 Status Review --color BLUE
tsk github project field option-update circlesac 1 Status Review --new-name "In Review" --color YELLOW
tsk github project field option-delete circlesac 1 Status "In Review"
tsk github project field option-recolor circlesac 1 Status --map "Todo=GRAY,In Progress=BLUE,Done=GREEN"
```

Resolve fields and options by their current names before mutating them. Use `field list --json` when names contain Korean text, spaces, or similarly named options.

## GitHub Project Items

```bash
tsk github project item list circlesac 1
tsk github project item list circlesac 1 --json
tsk github project item field-set circlesac 1 --field Phase --value Plan --where "단계=사전검토" --dry-run
tsk github project item field-set circlesac 1 --field Phase --value Plan --where "단계=사전검토"
tsk github project item field-clear circlesac 1 --field TestDate --where "단계=T0 시료"
tsk github project item archive circlesac 1 --where "Status=Done" --dry-run
tsk github project item unarchive circlesac 1 --item-ids PVTI_example1,PVTI_example2
tsk github project item move circlesac 1 42 --after 41
```

Run the exact bulk selector with `--dry-run` before `field-set` or `archive`, then execute the same command without changing the selector. Read the affected items back after the write.

## Project Status Updates

```bash
tsk github project status-update list circlesac 1
tsk github project status-update create circlesac 1 --body "On schedule" --status ON_TRACK --target-date 2026-08-18
tsk github project status-update update circlesac 1 <id> --status AT_RISK
tsk github project status-update delete circlesac 1 <id>
```

Statuses are `INACTIVE`, `ON_TRACK`, `AT_RISK`, `OFF_TRACK`, and `COMPLETE`.

## Project Workflows

```bash
tsk github project workflow list circlesac 1
tsk github project workflow list circlesac 1 --json
tsk github project workflow toggle circlesac 1 2 --enable
tsk github project workflow toggle circlesac 1 2 --disable
tsk github project workflow update circlesac 1 2 --name "Auto-add issues" --content-types "Issue,PullRequest"
```

Workflow writes use the unofficial web endpoint. Capture the current workflow state and restore it after any designated test-space mutation.

## Project Charts

```bash
tsk github project chart list circlesac 1
tsk github project chart list circlesac 1 --json
tsk github project chart create circlesac 1 --x-field Status --type column --filter "is:open"
tsk github project chart update circlesac 1 2 --name "Open work" --filter "is:open" --period 2W
tsk github project chart delete circlesac 1 2
```

Chart types are `column`, `line`, and `bar`.

## Verification and Safety

- Use read-only commands first to verify Jira token, GitHub API token, browser cookies, account identity, and target resource numbers.
- Use designated test Jira issues and GitHub Projects for reversible write verification.
- Do not treat `--dry-run` as proof that a write endpoint still works.
- For live write verification, perform create, readback, update, delete, and final-state restoration.
- Browser-backed GitHub operations can break when GitHub changes its internal web endpoints even if GraphQL operations still work.
- An empty browser-cookie query can mean wrong profile, missing SQLite WAL/SHM data, delayed browser flush, permission denial, or a truly absent session. Distinguish these before reporting logout.
- Never log or paste `user_session`, `_gh_sess`, `ghToken`, Jira tokens, or raw credential files.
