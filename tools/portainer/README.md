# Portainer deployment

Two separate stacks, because they are two different things: the rewards script runs headless and needs your
account credentials, while `edge-browse-minutes` needs a real signed-in Edge and no credentials at all.

## 1. Rewards script (searches, daily set, visual search)

Portainer -> **Stacks** -> **Add stack** -> **Web editor**, paste
[microsoft-rewards-script.stack.yml](microsoft-rewards-script.stack.yml).

Before deploying, add your credentials under **Environment variables** in the same screen:

| Name | Value |
| --- | --- |
| `ACCOUNT_1_EMAIL` | your Microsoft account |
| `ACCOUNT_1_PASSWORD` | its password |

They are interpolated into the stack at deploy time, so nothing sensitive is stored in this repository. For a
second account add `ACCOUNT_2_EMAIL` / `ACCOUNT_2_PASSWORD` in Portainer and copy the two matching lines in the
stack's `environment:` block. Numbering starts at 1 and must be contiguous - the script stops reading at the first
missing `ACCOUNT_N_EMAIL`.

Config data and browser sessions are bind mounted to `/mnt/hdd/microsoft-rewards-script/{config,sessions}`. Create
those directories first, or Docker will create them as root.

Any other setting can be overridden the same way with the `CONFIG_*` variables listed in the main README - for
example `CONFIG_WORKER_VISUAL_SEARCH` (already set to `true` in the stack) or `CONFIG_CLUSTERS`.

## 2. edge-browse-minutes (the Edge 30-minute streak)

This one has to be built, so use **Add stack** -> **Repository** instead of the web editor:

| Field | Value |
| --- | --- |
| Repository URL | `https://github.com/ntamas94/Microsoft-Rewards-Script` |
| Repository reference | `refs/heads/feat/edge-browsing-minutes` |
| Compose path | `tools/edge-browse-minutes/compose.yaml` |

Optionally set `EDGE_PROFILE_DIR` as a stack environment variable; it defaults to
`/mnt/hdd/edge-browse-minutes/profile`.

The first deploy needs the one-off Edge sign-in, which Portainer cannot do for you. Either run the `signin` command
once over SSH (`docker compose run --rm --service-ports edge-browse-minutes signin`), or deploy the stack, open a
console on the container in Portainer and start it there, then attach to noVNC on port 6080 through an SSH tunnel.

No credentials are stored for this container - it uses whatever Edge profile lives in the mounted directory.
