# windows-vm

A Windows 11 virtual machine on the Linux server, for the one task that cannot be done any other way:
the **Edge browsing streak**. Microsoft credits those minutes on Windows and Xbox only - a Linux Edge browses
happily and earns nothing, which we measured before building this (see
[../edge-browse-minutes/README.md](../edge-browse-minutes/README.md)).

Inside the VM, `edge-browse-minutes` runs natively on real Windows Edge, which is exactly the environment the
telemetry expects.

## Before you start

This is the expensive option. It permanently occupies **2 CPU cores, 4GB RAM and ~48GB of disk** to earn
**5 points a day** (100 on the seventh). If you have an Xbox, use that instead - it takes five minutes. If you have
a Windows PC you can leave running, run the tool there instead.

Windows licensing is your business: the image pulls official Microsoft media and installs it unactivated. That
works for this purpose, with cosmetic nags.

Requirements on the host:

```bash
egrep -c '(vmx|svm)' /proc/cpuinfo && ls -l /dev/kvm
```

## Setup

```bash
cp .env.example .env   # set WINDOWS_PASSWORD - the VM's local login, not your Microsoft password
```

```bash
docker compose up -d && docker compose logs -f
```

Open `http://<host>:8006` and watch the unattended install (20-40 minutes). If the server is remote, tunnel it -
that viewer has no authentication:

```bash
ssh -L 8006:localhost:8006 user@server
```

When the desktop appears, `oem/install.bat` has already run: Node is installed, the tool is in
`C:\edge-browse-minutes`, sleep is disabled and a daily task is registered for 03:00.

## The one manual step

Open Edge in the VM and **sign in to Edge itself** with your Microsoft account (profile icon, top right). The
streak is credited per signed-in Edge profile and this cannot be automated. Then confirm the tool sees it:

```
cd C:\edge-browse-minutes
node index.mjs --status
```

`Edge browsing time: 0/30 min` means everything is wired up. Run `node index.mjs` once to watch it climb - on
Windows the counter moves in ~5 minute blocks, so give it 15-20 minutes before judging.

## Driving the VM from the Docker host

`docker exec` only reaches the container's Linux side, where QEMU runs - not into Windows. Instead the container
publishes port 2222, which dockurr forwards to the VM's own OpenSSH server (enabled by `oem/install.bat`):

```bash
ssh -p 2222 rewards@127.0.0.1 "cd C:\edge-browse-minutes && node index.mjs --status"
```

Run the whole session the same way, or from a host cron job if you would rather schedule it outside the VM:

```bash
ssh -p 2222 rewards@127.0.0.1 "cd C:\edge-browse-minutes && node index.mjs"
```

To avoid typing the VM password every time, install a key once - from the VM console, with your host's public key:

```
powershell -Command "Add-Content $env:USERPROFILE\.ssh\authorized_keys 'ssh-ed25519 AAAA... user@host'"
```

The port is bound to `127.0.0.1`, so this works from the server itself; tunnel if you want it from elsewhere.

## Notes

- The scheduled task runs at 03:00 daily. The VM must be running at that time; `restart: unless-stopped` handles
  reboots of the host.
- The tool's focus keeper grabs the foreground window every 20 seconds. Inside the VM that is harmless - it can
  only affect the VM's own desktop, never your machine.
- Edge must be freshly started for the counter to track reliably; the tool starts and closes it each run, which is
  the behaviour people on Windows have to reproduce by hand with Task Manager.
- If the counter never moves, check that the profile is signed in, and that tracking prevention is on Balanced
  rather than Strict (`edge://settings/privacy`).
