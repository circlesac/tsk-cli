---
name: release
description: Trigger a new release of tsk CLI via GitHub Actions
disable-model-invocation: true
---

Release a new version of tsk-cli. NEVER manually bump versions.

## Steps

1. Push all changes:
   ```bash
   git push origin main
   ```

2. Trigger the release workflow:
   ```bash
   gh workflow run release.yml
   ```

3. Wait for completion:
   ```bash
   sleep 5
   RUN_ID=$(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
   gh run watch "$RUN_ID" --exit-status
   ```

4. If failed, check logs:
   ```bash
   gh run view "$RUN_ID" --log-failed
   ```

5. On success, update local binary:
   ```bash
   brew update && brew upgrade circlesac/tap/tsk
   ```

The release workflow bumps CalVer via `@circlesac/oneup`, builds darwin/linux x64+arm64 binaries, creates a GitHub release, publishes to npm, and updates the Homebrew tap.
