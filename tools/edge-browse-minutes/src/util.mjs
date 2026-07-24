const COLORS = {
    reset: '\x1b[0m',
    gray: '\x1b[90m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m'
}

function stamp() {
    return new Date().toLocaleTimeString('hu-HU', { hour12: false })
}

function line(color, tag, message) {
    console.log(`${COLORS.gray}[${stamp()}]${COLORS.reset} ${color}${tag.padEnd(8)}${COLORS.reset} ${message}`)
}

export const log = {
    info: (tag, message) => line(COLORS.cyan, tag, message),
    ok: (tag, message) => line(COLORS.green, tag, message),
    warn: (tag, message) => line(COLORS.yellow, tag, message),
    error: (tag, message) => line(COLORS.red, tag, message),
    debug: (tag, message) => line(COLORS.gray, tag, message)
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

export const pick = list => list[randInt(0, list.length - 1)]

export function formatDuration(ms) {
    const total = Math.round(ms / 1000)
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/** Depth-first walk over a JSON value, calling visit(objectNode, dottedPath) for every plain object. */
export function walkObjects(root, visit) {
    const pending = [[root, '$']]
    const seen = new Set()

    while (pending.length) {
        const [value, path] = pending.pop()
        if (!value || typeof value !== 'object' || seen.has(value)) continue
        seen.add(value)

        if (Array.isArray(value)) {
            value.forEach((entry, index) => pending.push([entry, `${path}[${index}]`]))
            continue
        }

        visit(value, path)
        for (const [key, entry] of Object.entries(value)) pending.push([entry, `${path}.${key}`])
    }
}
