# tsk-cli

Unified task management CLI — fills the gaps in official tools (gh, acli).

## Architecture

```
src/
├── index.ts                 # citty root — wires `jira` + `github` subcommands
├── lib/
│   └── update-check.ts      # CalVer version notification
└── platforms/
    ├── jira/                # acli token-backed (Keychain)
    │   ├── auth.ts api.ts index.ts
    │   └── commands/{issue,comment,attachment}/
    └── github/              # browser session cookie + gh PAT
        ├── auth.ts          # Chromium cookie extraction (AES-128-CBC via Keychain)
        ├── api.ts           # /memexes/ internal API + GraphQL helpers
        ├── credentials.ts   # ~/.config/tsk/github-credentials.json
        ├── types.ts
        ├── index.ts
        └── commands/
            ├── auth/{login,logout,status}
            ├── issue-type/{list,create,update,delete}   # org-only
            ├── issue/{type-set}
            └── project/
                ├── view/{create,update,delete}           # /memexes/<id>/views
                ├── field/{list,create,update,option-add,option-update,option-delete,option-recolor}
                ├── item/{list,field-set,field-clear,archive,unarchive,move}
                ├── status-update/{list,create,update,delete}  # GraphQL
                ├── workflow/{list,toggle,update}         # /memexes/<id>/workflows
                └── chart/{list,create,update,delete}     # /memexes/<id>/charts
```

## Two-token model for GitHub

- **Browser session cookie** — required for `/memexes/<id>/*` writes (view/workflow/chart CRUD, item move). Bearer token doesn't work for `/memexes/`.
- **`gh` PAT** — required for GraphQL reads and mutations (issue-type, field, item field-set, status-update). tsk shells out to `gh api graphql`.

Owner type auto-detected via `getOwnerKind(login)` (cached per process) — works for both org and user projects.

GraphQL queries use the `owner:` alias trick so response handlers don't care about org vs user:

```ts
`query { ${ownerRoot(login)} { projectV2(number:N) { ... } } }`
// expands to: `query { owner: organization(login:"X") { ... } }` (or user(...))
// reads at: data.owner?.projectV2?.X
```

Exception: `issue-type` queries are org-only (users don't have Issue Types) — they explicitly use `organization(login:X)`.

## /memexes/ endpoint patterns

All write endpoints follow the same shape — POST to root with body, PUT/DELETE with identifier in body:

| Endpoint | POST (create) | PUT (update) | DELETE |
|---|---|---|---|
| `/memexes/<id>/views` | `{view: {...}}` | `{viewNumber: N, view: {...}}` | `{viewNumber: N}` |
| `/memexes/<id>/workflows` | (constrained by GitHub) | `{workflowNumber, name, contentTypes, enabled, actions}` | TBD |
| `/memexes/<id>/charts` | `{chart: {configuration}}` | `{chartNumber: N, chart: {name, configuration}}` | `{chartNumber: N}` |

Required headers for all `/memexes/` calls:
- `x-fetch-nonce` from `<meta name="fetch-nonce">` on a project page (fetched on every request)
- `github-verified-fetch: true`
- `x-requested-with: XMLHttpRequest`
- Session cookies (`user_session`, `_gh_sess`, etc.)

`_gh_sess` rotates per request — captured from Set-Cookie on the page fetch.

## Release

Releases go through GitHub Actions. Do NOT manually bump versions or publish.

```bash
# 1. Run tests
bun run test

# 2. Push changes to main
git push origin main

# 3. Trigger release workflow
gh workflow run release.yml

# 4. Monitor until completion — do NOT return to user until done
RUN_ID=$(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status

# 5. If failed, check logs, fix, and re-release
gh run view "$RUN_ID" --log-failed

# 6. After success, update local binary
brew update && brew upgrade circlesac/tap/tsk
```

The workflow bumps CalVer via `@circlesac/oneup`, builds multi-platform binaries (darwin/linux, x64+arm64), creates a GitHub release, publishes to npm, and updates the Homebrew tap.

## Development conventions

- citty `defineCommand` for all commands
- `.js` ESM import extensions (even for .ts source — bun resolves it)
- Use `requireCookies()` from credentials.ts for any /memexes/ command — exits with friendly error if not authed
- For GraphQL reads, use `ghGraphQL<T>(query)` helper in api.ts (shells `gh api graphql`)
- For GraphQL queries that need owner routing, use `ownerRoot(login)` to build the root + alias
- New `/memexes/` write helpers: create `memex<Resource>Call` helper similar to `memexCall` for views

## Reverse engineering /memexes/ endpoints

When adding new write endpoints:

1. Open Playwright Firefox with persistent profile (`/tmp/gh-firefox-profile`)
2. Capture POST/PUT/DELETE with body via `page.on('request', ...)`
3. Drive the UI (click buttons in real GitHub web UI) to trigger the operation
4. Read the captured body shape
5. Implement helper in `api.ts` + command file
6. Live-test against zigbang-smarthome Project #3

See `/tmp/gh-network-capture/` for past capture scripts as templates.

## Skill: github-project-setup

The `dev-skills/skills/github-project-setup/SKILL.md` documents the discovery and how to use the API patterns. Keep that doc in sync with `api.ts` when new endpoints are added.
