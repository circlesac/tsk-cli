# acli compatibility boundary

This document records which Jira operations remain in `tsk` after checking the latest available Atlassian CLI.

Last checked: 2026-11-18 KST.

## Verification

The latest Apple Silicon binary from Atlassian's official installer URL reported `acli 1.3.41-stable`:

```sh
curl -fsSL https://acli.atlassian.com/darwin/latest/acli_darwin_arm64/acli -o /tmp/acli-latest
chmod +x /tmp/acli-latest
/tmp/acli-latest --version
```

The command surfaces were compared with the installed `tsk` CLI using `--help` for Jira work-item view, comments, and attachments.

## Decisions

| Capability | acli 1.3.41 | tsk decision |
| --- | --- | --- |
| Jira issue view and custom fields | `acli jira workitem view` accepts arbitrary fields and `--fields '*all'`. | Removed from tsk; use acli. |
| Jira comments | acli supports plain text or ADF. | Keep tsk Markdown input and `@email`/`@accountId` mention conversion. |
| Jira attachment download | acli exposes attachment list/delete but no download command. | Keep tsk attachment download. |

Repeat this check after an acli upgrade. If acli gains Markdown mention conversion or attachment download, remove the corresponding tsk surface and update this document.
