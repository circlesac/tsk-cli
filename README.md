# tsk — Circles Tasks

Unified task management CLI. **Fills the gaps in official tools** — only implements operations the native CLI can't.

## Supported Platforms

| Platform | Auth | Status |
|---|---|---|
| **Jira** | acli token (Keychain) | Current |
| **GitHub Projects v2** | Browser cookies + `gh` PAT | Current |
| Asana | — | Planned |
| Google Tasks | — | Planned |
| Apple Reminders | — | Planned |

Scope rule: tsk only implements operations the official tool **can't do**. e.g. for GitHub, tsk wraps the internal `/memexes/` endpoint (view/workflow/chart CRUD, field option color, item bulk operations) and GraphQL mutations gh doesn't expose. Anything `gh` does well — view listing, item-create, etc — is left to `gh`.

## Install

```bash
brew install circlesac/tap/tsk
# or
npm install -g @circlesac/tsk
```

## Jira

Reuses acli token (`acli jira auth login --token` first).

```bash
tsk jira issue view SHMV-2464
tsk jira comment add SHMV-2464 --body "..."
tsk jira attachment list SHMV-2464
tsk jira attachment download SHMV-2464 --id 20192
```

## GitHub Projects v2

**Setup** (one-time):

```bash
# 1. Log in to github.com in your default browser
# 2. gh CLI auth (for read GraphQL)
gh auth login

# 3. Extract session cookies for write ops on internal /memexes/ endpoint
tsk github auth login
```

Org **and** user projects supported — owner type (org/user) auto-detected.

### Issue Types (org-level)

`gh` has no command for org-level Issue Types.

```bash
tsk github issue-type list <org>
tsk github issue-type create <org> <name> --color PURPLE
tsk github issue-type update <org> <name> --new-name X --color RED
tsk github issue-type delete <org> <name>
```

### Issue → Type assignment

```bash
# Single
tsk github issue type-set <owner>/<repo>#42 Epic

# Bulk on a repo
tsk github issue type-set <owner>/<repo> Epic --bulk [--state OPEN] [--milestone N] [--label X]
```

### Project Views

`gh` has no view CRUD — implemented via internal `/memexes/` endpoint.

```bash
tsk github project view create <owner> <project> --name X --layout roadmap --filter "type:Epic" \
    --group-by ID --vertical-group-by ID --sort-by 'ID:asc' --slice-field ID

tsk github project view update <owner> <project> <view#> --name Y --filter Z
tsk github project view delete <owner> <project> <view#>
```

`view update` preserves groupBy/sortBy/verticalGroupBy/visibleFields if not specified (PUT is full-replacement, but tsk re-fills from current state).

### Project Fields

```bash
tsk github project field list <owner> <project>             # gh has this but tsk shows option colors
tsk github project field create <owner> <project> --name X --type text|number|date|iteration \
    --iteration-start 2026-01-01 --iteration-duration 14

tsk github project field update <owner> <project> <field> --name newname

# Single-select option management (gh has no granular option update)
tsk github project field option-add <field> <option> --color BLUE
tsk github project field option-update <field> <option> --color RED
tsk github project field option-delete <field> <option>

# Bulk recolor — one API call for many options
tsk github project field option-recolor <field> --map "사전검토=GRAY,금형투입=BLUE,..."
```

### Project Items (bulk)

`gh project item-edit` is 1-by-1. tsk does bulk with `--where` filter.

```bash
tsk github project item list <owner> <project>          # tsk shows inline field values + handles Korean fields

tsk github project item field-set <owner> <project> --field Phase --value Plan --where "단계=사전검토" [--dry-run]
tsk github project item field-clear <owner> <project> --field TestDate --where "단계=T0 시료"

tsk github project item archive <owner> <project> --where "..." [--dry-run] [--all]
tsk github project item unarchive <owner> <project>    # unarchives all archived items

tsk github project item move <owner> <project> <issue#> [--after <other-issue#>]
```

### Project Status Updates

The "Add status update" UI feature. `gh` has no equivalent.

```bash
tsk github project status-update list <owner> <project>
tsk github project status-update create <owner> <project> --body "..." --status ON_TRACK --target-date 2026-08-18
tsk github project status-update update <owner> <project> <id> --status AT_RISK
tsk github project status-update delete <owner> <project> <id>
```

Statuses: `INACTIVE | ON_TRACK | AT_RISK | OFF_TRACK | COMPLETE`

### Project Workflows (automation)

```bash
tsk github project workflow list <owner> <project>
tsk github project workflow toggle <owner> <project> <wf#> --enable | --disable
tsk github project workflow update <owner> <project> <wf#> --name X --content-types "Issue,PullRequest"
```

### Project Insights Charts

```bash
tsk github project chart list <owner> <project>
tsk github project chart create <owner> <project> --x-field "단계" --type column --filter "is:open"
tsk github project chart update <owner> <project> <chart#> --name X --filter "..." --period 2W
tsk github project chart delete <owner> <project> <chart#>
```

Chart types: `column`, `line`, `bar`.

## Auth deep dive

### Browser cookie extraction (macOS)

Chromium browsers encrypt cookies with AES-128-CBC keyed off the macOS Keychain "Safe Storage" password. tsk reads the Cookie SQLite DB and decrypts using the matching keychain entry.

Browsers supported (priority by default browser):
- Chrome (`Chrome Safe Storage`)
- Comet (`Comet Safe Storage`)
- Arc (`Arc Safe Storage`)
- Edge (`Microsoft Edge Safe Storage`)
- Brave (`Brave Safe Storage`)
- Chromium (`Chromium Safe Storage`)

```bash
# Force a specific browser
tsk github auth login --browser arc

# Open GitHub login page in default browser (when not yet logged in)
tsk github auth login --open-browser
```

### Two-token model

| Operation kind | Auth |
|---|---|
| `/memexes/` write ops (view, workflow, chart, item move) | **Session cookie** (browser) |
| GraphQL reads & mutations (issue-type, field, item field-set, status-update) | **`gh` PAT** (shell out) |

Both required for full functionality. Stored at:

- `~/.config/tsk/github-credentials.json` — browser cookies
- `~/.config/gh/` — gh PAT (standard)

## Why not just gh?

`gh` is broader and covers most Projects v2 basics. tsk **never** duplicates what `gh` does well. It only adds:

| Operation | `gh` | `tsk` |
|---|---|---|
| Org Issue Type CRUD + assignment | ❌ | ✅ |
| View create (full schema) | basic only | ✅ extended |
| View update / delete | ❌ | ✅ |
| Field option color, rename, granular add/delete | ❌ | ✅ |
| Field option bulk recolor (1 call) | ❌ | ✅ |
| Item bulk field-set with `--where` | 1-by-1 only | ✅ |
| Item field-clear | ❌ | ✅ |
| Item unarchive | ❌ | ✅ |
| Item move position | ❌ | ✅ |
| Status update CRUD | ❌ | ✅ |
| Workflow toggle / update | ❌ | ✅ |
| Chart CRUD | ❌ | ✅ |

Risk: `/memexes/` endpoints are unofficial — what GitHub web UI itself calls. They can change without notice. We've documented body shapes from live reverse engineering.

## License

MIT
