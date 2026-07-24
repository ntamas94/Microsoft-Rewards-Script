#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { ROOT, loadConfig } from './src/config.mjs'
import { browseCycle } from './src/browse.mjs'
import { IS_WINDOWS, connectToEdge, findEdge, launchEdge, pageFor } from './src/edge.mjs'
import { dumpPayload, readBrowseProgress } from './src/progress.mjs'
import { formatDuration, log, sleep } from './src/util.mjs'

const execFileAsync = promisify(execFile)

const BING_HOME = 'https://www.bing.com/'
const SIGN_IN_HINT = [
    'Sign in to EDGE ITSELF in the window that just opened (profile icon, top right),',
    'not only to bing.com. Rewards counts browsing minutes per Edge profile.',
    'This is a one-off step - the profile lives in the userDataDir from config.json.'
]

const flags = {
    dump: process.argv.includes('--dump'),
    status: process.argv.includes('--status'),
    noForeground: process.argv.includes('--no-foreground')
}

/** Only needed when attaching to an Edge this process did not start. */
async function findEdgePid(userDataDir) {
    try {
        if (IS_WINDOWS) {
            const script = [
                `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'"`,
                `Where-Object { $_.CommandLine -like '*${userDataDir}*' }`,
                `ForEach-Object { $p = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { $p.Id } }`
            ].join(' | ')

            const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script])
            const pid = Number(stdout.split(/\r?\n/)[0]?.trim())
            return Number.isInteger(pid) && pid > 0 ? pid : null
        }

        // The browser process is the oldest match; renderers inherit the same flag
        const { stdout } = await execFileAsync('pgrep', ['-f', `--user-data-dir=${userDataDir}`])
        const pid = Number(stdout.split('\n')[0]?.trim())
        return Number.isInteger(pid) && pid > 0 ? pid : null
    } catch {
        return null
    }
}

async function closeEdge(edgePid) {
    if (!edgePid) return
    try {
        if (IS_WINDOWS) await execFileAsync('taskkill', ['/PID', String(edgePid), '/T', '/F'])
        else process.kill(edgePid, 'SIGTERM')
        log.info('EDGE', 'Edge closed')
    } catch {
        log.debug('EDGE', 'Edge was already gone')
    }
}

function startForegroundKeeper(edgePid) {
    const child = IS_WINDOWS
        ? spawn(
              'powershell',
              [
                  '-NoProfile',
                  '-ExecutionPolicy',
                  'Bypass',
                  '-File',
                  path.join(ROOT, 'src', 'keep-awake.ps1'),
                  '-EdgePid',
                  String(edgePid)
              ],
              { stdio: 'ignore' }
          )
        : spawn('bash', [path.join(ROOT, 'src', 'keep-awake.sh'), String(edgePid)], { stdio: 'ignore' })

    log.info('FOCUS', `Foreground keeper running for PID ${edgePid} - it keeps the Edge window active every 20s`)
    return child
}

/** Waits until the flyout API answers as a signed-in Rewards user. */
async function waitForSignIn(page, attempts) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const result = await readBrowseProgress(page)

        if (result.error !== 'no-json' && result.signedIn) return result

        if (attempt === 0) SIGN_IN_HINT.forEach(line => log.warn('SIGNIN', line))
        else if (attempt % 3 === 0) log.info('SIGNIN', 'Waiting for the Edge sign-in...')

        if (attempt < attempts - 1) await sleep(10000)
    }

    return null
}

function reportCounter(result) {
    const others = Object.entries(result.partners)
        .filter(([name, p]) => name !== 'edge' && p.progress !== null && p.max !== null)
        .map(([name, p]) => `${name} ${p.progress}/${p.max}`)
        .join(' | ')

    if (!result.counter) {
        log.warn('POINTS', 'No partner_edge block in the payload - the browsing streak is not offered on this account')
        if (others) log.debug('POINTS', `Other daily check-in partners: ${others}`)
        return null
    }

    const { progress, max, currentStep, totalSteps, enabled, streakEnabled } = result.counter
    log.ok(
        'POINTS',
        `Edge browsing time: ${progress}/${max} min | streak day ${currentStep}/${totalSteps} | balance=${result.balance ?? '?'}`
    )
    if (others) log.debug('POINTS', `Other daily check-in partners: ${others}`)

    if (!enabled || !streakEnabled) {
        log.warn(
            'POINTS',
            'The Edge browsing card is toggled off - switch it on once on rewards.bing.com, otherwise minutes will not count'
        )
    }

    return result.counter
}

async function main() {
    const config = loadConfig()
    const edgePath = findEdge(config.edgePath)

    const { pid, reused } = await launchEdge({
        edgePath,
        userDataDir: config.userDataDir,
        remoteDebuggingPort: config.remoteDebuggingPort,
        startUrl: BING_HOME
    })

    const { browser, context } = await connectToEdge(config.remoteDebuggingPort)
    const monitorPage = await pageFor(context, BING_HOME)
    const edgePid = pid ?? (await findEdgePid(config.userDataDir))

    let keeper = null
    let closed = false

    // browser.close() only detaches the CDP connection, so Edge itself has to be killed by PID
    const cleanup = async () => {
        if (closed) return
        closed = true
        keeper?.kill()
        await browser.close().catch(() => {})

        if (config.closeOnFinish && !flags.status && !flags.dump) await closeEdge(edgePid)
    }

    process.on('SIGINT', async () => {
        log.warn('EXIT', 'Interrupted - cleaning up')
        await cleanup()
        process.exit(130)
    })

    try {
        // --status/--dump report what is there right now; a real run waits for the one-off sign-in
        const attempts = flags.status || flags.dump ? 1 : 60
        const signedIn = await waitForSignIn(monitorPage, attempts)
        if (!signedIn) {
            log.error('SIGNIN', 'Not signed in to Edge with a Rewards account - sign in once, then run again.')
            return
        }

        if (flags.dump) {
            dumpPayload(signedIn.payload)
            reportCounter(signedIn)
            return
        }

        const start = reportCounter(signedIn)
        if (flags.status) return

        if (start && start.progress >= start.max) {
            log.ok('DONE', 'Today is already complete - nothing to do')
            return
        }

        if (config.keepForeground && !flags.noForeground) {
            if (edgePid) keeper = startForegroundKeeper(edgePid)
            else log.warn('FOCUS', 'Could not resolve the Edge window PID - skipping the foreground keeper')
        }

        if (reused) log.warn('EDGE', 'Attached to a running Edge - make sure it uses this tool\'s profile')

        const started = Date.now()
        const deadline = started + config.sessionTimeoutMinutes * 60000
        let nextPoll = Date.now() + config.pollSeconds * 1000
        let finished = false
        let lastProgress = start?.progress ?? 0

        // A dedicated tab does the browsing; the monitor tab has to stay on bing.com,
        // otherwise the same-origin fetch to the Rewards flyout API is blocked by CORS.
        const browsePage = await context.newPage()
        const shouldStop = () => finished || Date.now() > deadline

        while (!shouldStop()) {
            await browseCycle(browsePage, config, shouldStop)

            if (Date.now() < nextPoll) continue
            nextPoll = Date.now() + config.pollSeconds * 1000

            if (!monitorPage.url().includes('bing.com')) {
                await monitorPage.goto(BING_HOME, { waitUntil: 'domcontentloaded' }).catch(() => {})
            }

            const result = await readBrowseProgress(monitorPage)
            if (result.error === 'no-json') {
                log.warn('POINTS', 'Rewards API did not answer with JSON this round')
                continue
            }

            if (!result.counter) {
                log.debug('POINTS', 'Browsing counter missing from this response')
                continue
            }

            const { progress, max } = result.counter
            const delta = progress - lastProgress
            lastProgress = progress
            log.info(
                'POINTS',
                `${progress}/${max} min (+${delta}) | elapsed=${formatDuration(Date.now() - started)}`
            )

            if (progress >= max) {
                log.ok('DONE', `Edge browsing streak complete: ${progress}/${max} minutes`)
                finished = true
            }
        }

        if (!finished) {
            log.warn(
                'TIMEOUT',
                `Stopped after ${formatDuration(Date.now() - started)} at ${lastProgress}/${config.targetMinutes} minutes`
            )
        }
    } finally {
        await cleanup()
    }
}

main().catch(error => {
    log.error('FATAL', error.stack ?? String(error))
    process.exit(1)
})
