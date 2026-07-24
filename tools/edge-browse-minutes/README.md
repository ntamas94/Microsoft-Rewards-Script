# edge-browse-minutes

Fills the Microsoft Rewards **"Edge - Minutes: 0/30"** card: it starts the **real Edge** with a dedicated profile,
drives it over CDP (browsing, scrolling), and meanwhile reads the minute counter from the Rewards flyout API.

The main script deliberately does not do this: the minutes are not granted by a callable Rewards API, they are
reported by Edge's own internal telemetry. That is why the browser is not launched by Playwright here - Playwright's
default flags (`--disable-background-networking`, `--disable-sync`, ...) would kill exactly that telemetry. Instead
Edge is started as an ordinary process with `--remote-debugging-port`, and the tool attaches to it afterwards.

## Requirements

- Microsoft Edge: Windows, or linux/amd64 through the bundled Docker image
- Node.js 20+ (not needed when running the container)
- You must be signed in to **Edge itself** (profile icon, top right), not just to bing.com

## Install

```bash
cd tools/edge-browse-minutes && npm install
```

## First run (one-off sign-in)

```bash
cd tools/edge-browse-minutes && node index.mjs --status
```

Edge opens with the empty profile stored in `edge-profile`. Sign in to **Edge** with your Microsoft account, then run
`--status` again: once you see the `Edge browsing time: x/30 min` line, everything is wired up. On Windows the profile
often signs in automatically from the Windows account, in which case there is nothing to do.

## Usage

```bash
cd tools/edge-browse-minutes && node index.mjs
```

Until the counter reaches 30 (or `sessionTimeoutMinutes` runs out), the tool opens Bing searches and MSN/news pages,
scrolls them like a person, and polls the progress every minute. When done, it closes Edge.

Flags:

| Flag | Effect |
| --- | --- |
| `--status` | Print the current progress and exit, no browsing |
| `--dump` | Write the raw Rewards JSON to a file (for when counter detection breaks) |
| `--no-foreground` | Do not pull the Edge window to the foreground |

## Docker (Linux, unverified)

The image installs `microsoft-edge-stable` and runs it on an Xvfb display with fluxbox (a window manager is
required, otherwise the window can never be activated and the focus keeper does nothing). noVNC is included for the
one-off sign-in.

**Important:** whether Microsoft credits browsing minutes from *Linux* Edge is not verified. The Rewards browsing
streak is also a rotating offer that not every account has. Measure it before relying on it: run `status`, let `run`
work for ~10 minutes, then run `status` again and check whether the counter moved.

The Edge profile is a bind mount, so it stays on the host disk you choose and survives rebuilds - it holds the
signed-in session, so losing it means signing in again. Set the path once:

```bash
cp .env.example .env   # EDGE_PROFILE_DIR, defaults to /mnt/hdd/edge-browse-minutes/profile
```

Build and sign in once:

```bash
docker compose build
docker compose run --rm --service-ports edge-browse-minutes signin
```

Open `http://localhost:6080/vnc.html`, sign in to Edge with your Microsoft account, then stop the container with a
single Ctrl+C and **wait for it to exit on its own**. Chromium writes the signed-in account to the profile lazily,
so a killed container loses exactly what the sign-in was for. The container asks Edge to shut down cleanly, gives
it up to 20 seconds, and then reports whether the account actually persisted. The noVNC port is bound to localhost and has no password - keep it off the public internet, and tunnel
over SSH (`ssh -L 6080:localhost:6080 user@server`) when the machine is remote.

Then:

```bash
docker compose run --rm edge-browse-minutes status   # print counters
docker compose up -d                                 # browse until 30/30
```

Use `command: ["loop"]` in `compose.yaml` (with `LOOP_HOURS`) if you want it to repeat daily instead of exiting.

Environment overrides, so no config.json has to be mounted: `EDGE_USER_DATA_DIR`, `EDGE_PATH`,
`EDGE_KEEP_FOREGROUND`, `EDGE_CLOSE_ON_FINISH`, `EDGE_SESSION_TIMEOUT_MINUTES`.

## Things to know

- **Focus matters.** Edge only counts *active* browsing, so the tool brings the Edge window to the foreground every
  20 seconds and blocks sleep. To turn it off, set `keepForeground: false` in `config.json` or pass
  `--no-foreground`.
  - On **Windows** this steals focus from whatever you are doing, so run it while you are away from the machine.
  - In **Docker** it does not: the window lives on the container's private Xvfb display, so nothing is ever
    focused on the host. The server stays fully usable and the container needs no attached terminal
    (`docker compose up -d`). Leave the keeper enabled there.
- **VNC is only for the sign-in.** After the profile is signed in, set `ENABLE_VNC=0` so unattended runs start no
  VNC server at all.
- **Tracking prevention.** If the profile is on Strict, Rewards may not detect the browsing at all. Keep it on
  Balanced (`edge://settings/privacy`).
- **No guarantees.** Microsoft measures the minutes server-side. The tool uses a real Edge, but what the telemetry
  accepts can change at any time. That is what `--dump` is for: if the payload shape changes, the detection logic in
  `src/progress.mjs` can be retuned from the dump.
- **The card is a rotating offer.** If the account has no `partner_edge` block in the payload, the browsing streak is
  not offered right now, and the tool says so instead of browsing for nothing.
- **Separate profile.** The `edge-profile` directory is not your daily Edge profile, so it does not interfere with
  your own browsing. To use your own profile instead, change `userDataDir` (your Edge must then be closed before this
  starts).

## Where the counter comes from

The daily check-in promotion in `https://www.bing.com/rewards/panelflyout/getuserinfo?channel=BingFlyout` carries one
attribute block per partner:

```
partner_edge_titleArg0: "12"   <- minutes browsed today
partner_edge_titleArg1: "30"   <- daily goal
partner_edge_currentStep: "1"  <- day within the 7-day streak
partner_edge_points: "[5,10,20,30,40,80,120]"
```

The same shape exists for `bing` (searches), `ntp` (MSN new tab), `outlook`, `dset` and `sapphire`, so `--status`
prints those too.

## Configuration

Every key is documented inline in [config.example.json](config.example.json) (the `"// key"` entries). On the first
run `config.json` is created from it.
