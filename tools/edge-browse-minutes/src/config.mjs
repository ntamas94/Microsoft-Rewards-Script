import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { log } from './util.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const CONFIG_PATH = path.join(ROOT, 'config.json')
const EXAMPLE_PATH = path.join(ROOT, 'config.example.json')

/** Keys starting with "// " are inline documentation in config.example.json. */
function stripComments(value) {
    if (Array.isArray(value)) return value.map(stripComments)
    if (!value || typeof value !== 'object') return value

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key]) => !key.startsWith('//'))
            .map(([key, entry]) => [key, stripComments(entry)])
    )
}

export function loadConfig() {
    if (!existsSync(CONFIG_PATH)) {
        copyFileSync(EXAMPLE_PATH, CONFIG_PATH)
        log.info('CONFIG', 'config.json created from config.example.json')
    }

    const config = stripComments(JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')))

    config.userDataDir = path.resolve(ROOT, config.userDataDir ?? './edge-profile')
    config.targetMinutes ??= 30
    config.sessionTimeoutMinutes ??= 75
    config.remoteDebuggingPort ??= 9222
    config.keepForeground ??= true
    config.closeOnFinish ??= true
    config.pollSeconds ??= 60
    config.dwell ??= { min: 45, max: 90 }
    config.bingSearchRatio ??= 0.5
    config.browseUrls ??= ['https://www.msn.com/']
    config.queries ??= ['news today']
    config.debug ??= false

    return config
}
