@echo off
:: Runs once at the end of the unattended Windows install (dockurr/windows /oem hook).
:: Sets up edge-browse-minutes and a daily scheduled task. Signing in to Edge stays manual.

echo [oem] keeping the machine awake
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate off

echo [oem] installing Node.js
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 echo [oem] WARNING: winget failed, install Node manually from nodejs.org

set "TOOL=C:\edge-browse-minutes"
set "SRC=%TEMP%\rewards"

echo [oem] fetching the tool
mkdir "%SRC%" 2>nul
curl -L -o "%SRC%\repo.zip" https://github.com/ntamas94/Microsoft-Rewards-Script/archive/refs/heads/v4.zip
tar -xf "%SRC%\repo.zip" -C "%SRC%"

mkdir "%TOOL%" 2>nul
xcopy /E /I /Y "%SRC%\Microsoft-Rewards-Script-v4\tools\edge-browse-minutes\*" "%TOOL%"

echo [oem] installing dependencies
cd /d "%TOOL%"
call npm install --omit=dev --no-audit --no-fund

echo [oem] enabling OpenSSH so the VM can be driven from the Docker host
powershell -NoProfile -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"
powershell -NoProfile -Command "Set-Service -Name sshd -StartupType Automatic; Start-Service sshd"
netsh advfirewall firewall add rule name="OpenSSH-Server-In-TCP" dir=in action=allow protocol=TCP localport=22

echo [oem] registering the daily task
schtasks /create /tn "EdgeBrowseMinutes" /tr "cmd /c cd /d %TOOL% && node index.mjs" /sc daily /st 03:00 /rl highest /f

echo [oem] done - sign in to Edge once, then run: node index.mjs --status
