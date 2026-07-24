import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { ROOT } from './config.mjs'
import { log, walkObjects } from './util.mjs'

const ENDPOINTS = [
    'https://www.bing.com/rewards/panelflyout/getuserinfo?channel=BingFlyout',
    'https://www.bing.com/rewards/panelflyout/getuserinfo',
    'https://www.bing.com/rewards/panelflyout/getuserinfo?channel=BingFlyout&partnerId=BingRewards'
]

/**
 * The daily check-in promotion carries one attribute block per partner, e.g.
 *   partner_edge_titleArg0: "12"   <- minutes browsed today
 *   partner_edge_titleArg1: "30"   <- daily goal
 *   partner_edge_currentStep/"totalSteps" <- day within the 7-day streak
 * Same shape for bing (searches), ntp (MSN new tab), outlook, dset, sapphire.
 */
const PARTNER_KEY = /^partner_([a-z0-9]+)_(.+)$/

function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
    return null
}

function toBool(value) {
    return typeof value === 'string' ? value.toLowerCase() === 'true' : value === true
}

/** Collects every partner_* attribute block found anywhere in the payload. */
export function extractPartners(payload) {
    const partners = new Map()

    walkObjects(payload, record => {
        for (const [key, value] of Object.entries(record)) {
            const match = PARTNER_KEY.exec(key)
            if (!match) continue

            const [, partner, field] = match
            const entry = partners.get(partner) ?? {}
            entry[field] = value
            partners.set(partner, entry)
        }
    })

    return Object.fromEntries(
        [...partners].map(([partner, fields]) => [
            partner,
            {
                progress: toNumber(fields.titleArg0),
                max: toNumber(fields.titleArg1),
                currentStep: toNumber(fields.currentStep),
                totalSteps: toNumber(fields.totalSteps),
                completed: toBool(fields.completed),
                enabled: toBool(fields.isEnabled),
                streakEnabled: toBool(fields.streakEnabled),
                activationOffer: fields.activationOffer ?? null,
                raw: fields
            }
        ])
    )
}

/** Generic "x of y" scan - only used for the --dump report when the shape changes. */
export function extractCandidates(payload) {
    const candidates = []

    walkObjects(payload, (record, path) => {
        const progress = toNumber(record.progress ?? record.Progress)
        const max = toNumber(record.max ?? record.Max ?? record.progressMax ?? record.complete)
        if (progress === null || max === null || max <= 0) return
        candidates.push({ progress, max, path })
    })

    return candidates
}

async function fetchJson(page, url) {
    return await page.evaluate(async endpoint => {
        try {
            const res = await fetch(endpoint, { credentials: 'include', headers: { accept: 'application/json' } })
            return { ok: res.ok, status: res.status, text: await res.text() }
        } catch (error) {
            return { ok: false, status: 0, text: String(error) }
        }
    }, url)
}

/** Reads the Rewards flyout payload from a page that is already on www.bing.com. */
export async function readUserInfo(page) {
    for (const endpoint of ENDPOINTS) {
        const res = await fetchJson(page, endpoint)
        if (!res.ok) continue

        try {
            return { endpoint, payload: JSON.parse(res.text) }
        } catch {
            // HTML sign-in page instead of JSON
        }
    }

    return null
}

export function isSignedIn(payload) {
    let signedIn = false

    walkObjects(payload, record => {
        for (const [key, value] of Object.entries(record)) {
            const name = key.toLowerCase()
            if ((name === 'issignedin' || name === 'isrewardsuser') && value === true) signedIn = true
            if ((name === 'balance' || name === 'availablepoints') && toNumber(value) !== null) signedIn = true
        }
    })

    return signedIn
}

export function pointsBalance(payload) {
    let balance = null

    walkObjects(payload, record => {
        for (const [key, value] of Object.entries(record)) {
            const name = key.toLowerCase()
            if ((name === 'balance' || name === 'availablepoints') && balance === null) {
                balance = toNumber(value)
            }
        }
    })

    return balance
}

export async function readBrowseProgress(page) {
    const info = await readUserInfo(page)
    if (!info) return { error: 'no-json' }

    const partners = extractPartners(info.payload)
    const edge = partners.edge ?? null
    const counter = edge && edge.progress !== null && edge.max !== null ? edge : null

    return {
        endpoint: info.endpoint,
        payload: info.payload,
        partners,
        counter,
        signedIn: isSignedIn(info.payload),
        balance: pointsBalance(info.payload)
    }
}

export function dumpPayload(payload) {
    const file = path.join(ROOT, `userinfo-dump-${Date.now()}.json`)
    writeFileSync(
        file,
        JSON.stringify(
            { partners: extractPartners(payload), candidates: extractCandidates(payload), payload },
            null,
            2
        ),
        'utf-8'
    )
    log.ok('DUMP', `Raw payload written to ${file}`)
    return file
}
