# Portainer deployment

Two containers: the rewards script runs headless and needs your account credentials, while
`edge-browse-minutes` needs a real signed-in Edge and no credentials at all.

## 0. Both at once

[all-in-one.stack.yml](all-in-one.stack.yml) runs both from a single stack, built from this fork - the rewards
image needs the passwordless login patch, and `edge-browse-minutes` has no published image:

```bash
docker compose -f tools/portainer/all-in-one.stack.yml up -d --build
```

It reads accounts from the repo-root `.env`, sets the Edge container to browse without searching (the rewards
script does the searching), and runs it on a 24 hour loop. The one-off Edge sign-in still has to happen first -
see section 2. The separate stacks below remain if you would rather deploy them independently.

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

The stack enables every worker and activity. Two of them ship disabled upstream and are worth a conscious choice:
`CONFIG_WORKER_VISUAL_SEARCH` (the visual-search streak - no downside) and `CONFIG_WORKER_BONUS_SEARCHES`, which
farms searches past the daily cap and is the only setting here that does not resemble ordinary use.

If you deploy with the repo-root `compose.yaml` and a `.env` instead of a Portainer stack, the same list is in
[env.full.example](env.full.example) - append it to your `.env` and recreate the container.

### Accounts without a password

If the Microsoft account signs in by Authenticator approval instead of a password, leave the password empty and
opt in explicitly:

```bash
ACCOUNT_1_EMAIL=you@example.com
ACCOUNT_1_PASSWORD=
ACCOUNT_1_PASSWORDLESS=true
```

Upstream rejects a missing password outright; this fork allows it behind that flag, which makes the login flow take
the code route and wait for you to approve a two-digit number on your phone. The session is then saved to
`sessions/` and reused, so the approval is needed only when that session expires - and a scheduled run that hits an
expired session will fail until someone taps the notification.

Because this is a fork-only change, the container has to be built from source rather than pulled:

```bash
docker compose -f compose.yaml -f tools/portainer/compose.build.override.yaml up -d --build
```

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
