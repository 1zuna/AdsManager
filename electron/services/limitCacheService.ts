import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { format } from 'date-fns'

interface CacheEntry {
  limit: number
  date: string // dd/MM/yyyy
}

type CacheStore = Record<string, CacheEntry>

function getCachePath(): string {
  return path.join(app.getPath('userData'), 'limit-cache.json')
}

function loadStore(): CacheStore {
  try {
    return JSON.parse(fs.readFileSync(getCachePath(), 'utf-8')) as CacheStore
  } catch {
    return {}
  }
}

function saveStore(store: CacheStore): void {
  const p = getCachePath()
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(store, null, 2), 'utf-8')
}

class LimitCacheService {
  private store: CacheStore = {}

  /** Load cache from disk. Call once per run before using get/set. */
  load(): void {
    this.store = loadStore()
  }

  /** Return the last limit set for this account today, or null if not cached. */
  getLimit(accountId: string): number | null {
    const today = format(new Date(), 'dd/MM/yyyy')
    const entry = this.store[accountId]
    if (!entry || entry.date !== today) return null
    return entry.limit
  }

  /** Persist a newly set limit for this account. */
  setLimit(accountId: string, limit: number): void {
    const today = format(new Date(), 'dd/MM/yyyy')
    this.store[accountId] = { limit, date: today }
    saveStore(this.store)
  }

  /** Remove cache entries from previous days. Call at the start of each run. */
  prunePreviousDay(): void {
    const today = format(new Date(), 'dd/MM/yyyy')
    let changed = false
    for (const key of Object.keys(this.store)) {
      if (this.store[key].date !== today) {
        delete this.store[key]
        changed = true
      }
    }
    if (changed) saveStore(this.store)
  }
}

export const limitCache = new LimitCacheService()
