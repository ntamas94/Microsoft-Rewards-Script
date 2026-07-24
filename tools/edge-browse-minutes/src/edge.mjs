import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

import { chromium } from 'patchright'

import { log, sleep } from './util.mjs'

export const IS_WINDOWS = process.platform === 'win32'

const KNOWN_PATHS = IS_WINDOWS
    ? [
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : ['/usr/bin/microsoft-edge-stable', '/usr/bin/microsoft-edge', '/opt/microsoft/msedge/msedge']

export function findEdge(configuredPath) {
    if (configuredPath) {
        if (!existsSync(configuredPath)) throw new Error(`edgePath does not exist: ${configuredPath}`)
        return configuredPath
    }

    const found = KNOWN_PATHS.find(existsSync)
    if (!found) throw new Error(`Edge binary not found in [${KNOWN_PATHS.join(', ')}] - set "edgePath" in config.json`)
    return found
}

async function probeEndpoint(port) {
    try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) })
        return res.ok ? await res.json() : null
    } catch {
        return null
    }
}

/**
 * Starts the real Edge with a dedicated profile and remote debugging enabled.
 *
 * Deliberately NOT launched by Playwright: Playwright's default flags disable background
 * networking, sync and telemetry, which is exactly the machinery Edge uses to report
 * browsing time to Rewards. Spawning Edge ourselves keeps it a completely ordinary browser.
 */
export async function launchEdge({ edgePath, userDataDir, remoteDebuggingPort, startUrl }) {
    const running = await probeEndpoint(remoteDebuggingPort)
    if (running) {
        log.warn('EDGE', `Reusing the Edge already listening on port ${remoteDebuggingPort} (${running.Browser})`)
        return { pid: null, reused: true }
    }

    if (!existsSync(userDataDir)) mkdirSync(userDataDir, { recursive: true })

    const args = [
        `--remote-debugging-port=${remoteDebuggingPort}`,
        `--user-data-dir=${userDataDir}`,
        '--remote-allow-origins=*',
        '--no-first-run',
        '--no-default-browser-check',
        // In a container Edge has no sandbox privileges, and /dev/shm is usually too small
        ...(IS_WINDOWS ? ['--start-maximized'] : ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1920,1080']),
        startUrl
    ]

    log.info('EDGE', `Starting ${edgePath}`)
    const child = spawn(edgePath, args, { detached: true, stdio: 'ignore' })
    child.unref()

    for (let attempt = 0; attempt < 40; attempt++) {
        await sleep(500)
        const version = await probeEndpoint(remoteDebuggingPort)
        if (version) {
            log.ok('EDGE', `Ready on port ${remoteDebuggingPort} | ${version.Browser}`)
            return { pid: child.pid, reused: false }
        }
    }

    throw new Error(`Edge did not open the debugging port ${remoteDebuggingPort} within 20s`)
}

export async function connectToEdge(remoteDebuggingPort) {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${remoteDebuggingPort}`)
    const context = browser.contexts()[0]
    if (!context) throw new Error('Edge exposed no browser context over CDP')
    return { browser, context }
}

/** Returns an existing page for the given origin, or opens a new one. */
export async function pageFor(context, url) {
    const origin = new URL(url).origin
    const existing = context.pages().find(page => {
        try {
            return new URL(page.url()).origin === origin
        } catch {
            return false
        }
    })

    if (existing) return existing

    const page = context.pages().find(p => p.url() === 'about:blank') ?? (await context.newPage())
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    return page
}
