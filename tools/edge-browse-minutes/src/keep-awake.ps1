# Keeps the Edge window in the foreground and stops Windows from sleeping.
# Edge only credits *active* browsing time, so a background window earns nothing.
# Started and stopped by index.mjs - run it by hand only for debugging.

param(
    [Parameter(Mandatory = $true)][int]$EdgePid,
    [int]$IntervalSeconds = 20
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32Focus {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
}
"@

$ES_CONTINUOUS = [uint32]0x80000000
$ES_SYSTEM_REQUIRED = [uint32]0x00000001
$ES_DISPLAY_REQUIRED = [uint32]0x00000002
$SW_RESTORE = 9

[void][Win32Focus]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED -bor $ES_DISPLAY_REQUIRED)
Write-Output "keep-awake: watching PID $EdgePid"

try {
    while ($true) {
        $process = Get-Process -Id $EdgePid -ErrorAction SilentlyContinue
        if (-not $process) {
            Write-Output "keep-awake: Edge process is gone, exiting"
            break
        }

        $handle = $process.MainWindowHandle
        if ($handle -ne [IntPtr]::Zero) {
            [void][Win32Focus]::ShowWindow($handle, $SW_RESTORE)
            [void][Win32Focus]::SetForegroundWindow($handle)
        }

        Start-Sleep -Seconds $IntervalSeconds
    }
}
finally {
    [void][Win32Focus]::SetThreadExecutionState($ES_CONTINUOUS)
}
