import { log, pick, randInt, sleep } from './util.mjs'

function nextUrl(config) {
    if (Math.random() < config.bingSearchRatio) {
        const query = pick(config.queries)
        return `https://www.bing.com/search?q=${encodeURIComponent(query)}&form=QBLH`
    }
    return pick(config.browseUrls)
}

async function humanScroll(page) {
    const rounds = randInt(3, 7)

    for (let i = 0; i < rounds; i++) {
        const direction = Math.random() < 0.2 ? -1 : 1
        await page.mouse.move(randInt(200, 1000), randInt(200, 700)).catch(() => {})
        await page.mouse.wheel(0, direction * randInt(200, 600)).catch(() => {})
        await sleep(randInt(1500, 4000))
    }
}

/**
 * One browsing cycle: open a page, scroll it like a person, linger.
 * `shouldStop` is polled so a finished session does not have to wait out the dwell.
 */
export async function browseCycle(page, config, shouldStop) {
    const url = nextUrl(config)

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    } catch (error) {
        log.warn('BROWSE', `Navigation failed (${url.slice(0, 60)}...): ${error.message.split('\n')[0]}`)
        return
    }

    log.debug('BROWSE', `Reading ${url.slice(0, 80)}`)
    await sleep(randInt(2000, 5000))
    await humanScroll(page)

    const dwellMs = randInt(config.dwell.min, config.dwell.max) * 1000
    const until = Date.now() + dwellMs

    while (Date.now() < until) {
        if (shouldStop()) return
        await sleep(2000)
    }
}
