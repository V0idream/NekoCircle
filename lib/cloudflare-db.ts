/** D1 adapter. Schema is applied by Wrangler migrations, never per request. */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { D1Connection } from './d1-connection';
import { circleWriteStatements } from './circle-persistence';
import type { D1Database } from '@cloudflare/workers-types';
export const DB_PATH = 'D1:NEKOCIRCLE_DB';
export function getDb() {
    const { env } = getCloudflareContext();
    const binding = (env as unknown as {
        NEKOCIRCLE_DB?: D1Database;
    }).NEKOCIRCLE_DB;
    if (!binding)
        throw new Error('NEKOCIRCLE_DB is not configured');
    return new D1Connection(binding);
}
export function initDb() { }
export async function getSetting(key: string): Promise<string> {
    const db = getDb();
    try {
        const row = (await db.prepare("SELECT value FROM settings WHERE key = ?").get(key)) as {
            value: string;
        } | undefined;
        return row?.value ?? (key === 'admin_password_hash' ? process.env.ADMIN_PASSWORD_HASH ?? '' : '');
    }
    finally {
        db.close();
    }
}
export async function setSetting(key: string, value: string) {
    const db = getDb();
    try {
        (await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value));
    }
    finally {
        db.close();
    }
}
export async function deleteSetting(key: string) {
    const db = getDb();
    try {
        (await db.prepare("DELETE FROM settings WHERE key = ?").run(key));
    }
    finally {
        db.close();
    }
}
export async function getAllSettings(): Promise<Record<string, string>> {
    const db = getDb();
    try {
        const rows = (await db.prepare("SELECT key, value FROM settings").all()) as {
            key: string;
            value: string;
        }[];
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    }
    finally {
        db.close();
    }
}
// ─────────────────────────────────────────────────────────
// Generation log
// ─────────────────────────────────────────────────────────
export async function logGeneration(source: string, username: string): Promise<void> {
    const db = getDb();
    try {
        (await db.prepare("INSERT INTO generation_log (source, username, created_at) VALUES (?, ?, ?)").run(source, username, Date.now()));
    }
    finally {
        db.close();
    }
}
export type GenerationCounts = {
    yahoo: number;
    total: number;
};
export async function getGenerationCounts(): Promise<GenerationCounts> {
    const db = getDb();
    try {
        const yahoo = ((await db.prepare("SELECT COUNT(*) as n FROM generation_log WHERE source = 'yahoo'").get()) as {
            n: number;
        }).n;
        return { yahoo, total: yahoo };
    }
    finally {
        db.close();
    }
}
// ─────────────────────────────────────────────────────────
// Yahoo Circles (persistent storage for Find-Yourself)
// ─────────────────────────────────────────────────────────
export type YahooCircleRow = {
    id: string;
    username: string;
    circle_data: string; // JSON
    storage_consent: number;
    consented_at: number | null;
    created_at: number;
};
export async function createYahooCircle(id: string, username: string, circleData: string, storageConsent = false): Promise<void> {
    const db = getDb();
    try {
        const now = Date.now();
        (await db.prepare("INSERT INTO yahoo_circles (id, username, circle_data, storage_consent, consented_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, username, circleData, storageConsent ? 1 : 0, storageConsent ? now : null, now));
    }
    finally {
        db.close();
    }
}
export async function persistYahooCircleGeneration(id: string, username: string, data: string, consent = false, db = getDb()): Promise<void> {
    const statements = circleWriteStatements(id, username, data, consent);
    await db.binding.batch(statements.map(s => db.binding.prepare(s.sql).bind(...s.values)));
}
export type TemporaryCircleCleanupSummary = {
    count: number;
    bytes: number;
    oldestCreatedAt: number | null;
};
export async function getTemporaryCircleCleanupSummary(olderThanMs?: number): Promise<TemporaryCircleCleanupSummary> {
    const db = getDb();
    try {
        const where = olderThanMs === undefined
            ? "storage_consent = 0"
            : "storage_consent = 0 AND created_at < ?";
        const row = (olderThanMs === undefined
            ? (await db.prepare(`SELECT COUNT(*) count, COALESCE(SUM(LENGTH(circle_data)), 0) bytes,
                  MIN(created_at) oldestCreatedAt
           FROM yahoo_circles WHERE ${where}`).get()) : (await db.prepare(`SELECT COUNT(*) count, COALESCE(SUM(LENGTH(circle_data)), 0) bytes,
                  MIN(created_at) oldestCreatedAt
           FROM yahoo_circles WHERE ${where}`).get(olderThanMs))) as {
            count: number;
            bytes: number;
            oldestCreatedAt: number | null;
        };
        return row;
    }
    finally {
        db.close();
    }
}
export async function cleanupTemporaryYahooCircles(olderThanMs?: number): Promise<TemporaryCircleCleanupSummary> {
    const db = getDb();
    try {
        const where = olderThanMs === undefined
            ? "storage_consent = 0"
            : "storage_consent = 0 AND created_at < ?";
        const select = db.prepare(`SELECT COUNT(*) count, COALESCE(SUM(LENGTH(circle_data)), 0) bytes,
              MIN(created_at) oldestCreatedAt
       FROM yahoo_circles WHERE ${where}`);
        const summary = (olderThanMs === undefined
            ? (await select.get()) : (await select.get(olderThanMs))) as TemporaryCircleCleanupSummary;
        if (summary.count > 0) {
            const remove = db.prepare(`DELETE FROM yahoo_circles WHERE ${where}`);
            if (olderThanMs === undefined)
                (await remove.run());
            else
                (await remove.run(olderThanMs));
        }
        return summary;
    }
    finally {
        db.close();
    }
}
let lastAutomaticCleanupAt = 0;
export async function maybeCleanupTemporaryYahooCircles(retentionMs: number, nowMs = Date.now()): Promise<TemporaryCircleCleanupSummary | null> {
    if (nowMs - lastAutomaticCleanupAt < 60 * 60 * 1000)
        return null;
    lastAutomaticCleanupAt = nowMs;
    return (await cleanupTemporaryYahooCircles(nowMs - retentionMs));
}
export async function getYahooCircle(id: string): Promise<YahooCircleRow | undefined> {
    const db = getDb();
    try {
        return (await db.prepare("SELECT * FROM yahoo_circles WHERE id = ?").get(id)) as YahooCircleRow | undefined;
    }
    finally {
        db.close();
    }
}
export async function findRecentYahooCircle(username: string, ttlMs: number, storageConsent?: boolean): Promise<YahooCircleRow | undefined> {
    const db = getDb();
    try {
        const cutoff = Date.now() - ttlMs;
        if (storageConsent !== undefined) {
            return (await db.prepare("SELECT * FROM yahoo_circles WHERE LOWER(username) = LOWER(?) AND created_at > ? AND storage_consent = ? ORDER BY created_at DESC LIMIT 1").get(username, cutoff, storageConsent ? 1 : 0)) as YahooCircleRow | undefined;
        }
        return (await db.prepare("SELECT * FROM yahoo_circles WHERE LOWER(username) = LOWER(?) AND created_at > ? ORDER BY created_at DESC LIMIT 1").get(username, cutoff)) as YahooCircleRow | undefined;
    }
    finally {
        db.close();
    }
}
// ─────────────────────────────────────────────────────────
// Unified circle lookup (Yahoo only now)
// ─────────────────────────────────────────────────────────
export type UnifiedCircle = {
    source: "yahoo";
    id: string;
    username: string;
    created_at: number;
    storage_consent: boolean;
    consented_at: number | null;
    data: string;
};
export async function getCircleByAnyId(id: string): Promise<UnifiedCircle | undefined> {
    const db = getDb();
    try {
        const yh = (await db.prepare("SELECT * FROM yahoo_circles WHERE id = ?").get(id)) as YahooCircleRow | undefined;
        if (yh) {
            return {
                source: "yahoo",
                id: yh.id,
                username: yh.username,
                created_at: yh.created_at,
                storage_consent: yh.storage_consent === 1,
                consented_at: yh.consented_at,
                data: yh.circle_data,
            };
        }
        return undefined;
    }
    finally {
        db.close();
    }
}
// ─────────────────────────────────────────────────────────
// Announcements
// ─────────────────────────────────────────────────────────
export type AnnouncementRow = {
    id: number;
    title: string;
    content: string;
    type: string; // 'info' | 'warning' | 'success'
    active: number; // 0 | 1
    pinned: number; // 0 | 1
    locale: string; // 'all' | 'zh' | 'en' | 'ja'
    created_at: number;
    updated_at: number;
};
export async function createAnnouncement(title: string, content: string, type = "info", locale = "all"): Promise<number> {
    const db = getDb();
    try {
        const now = Date.now();
        const r = (await db.prepare("INSERT INTO announcements (title, content, type, locale, active, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 0, ?, ?)").run(title, content, type, locale, now, now));
        return r.lastInsertRowid as number;
    }
    finally {
        db.close();
    }
}
export async function updateAnnouncement(id: number, data: Partial<Pick<AnnouncementRow, "title" | "content" | "type" | "active" | "pinned" | "locale">>): Promise<void> {
    const db = getDb();
    try {
        const updates = { ...data, updated_at: Date.now() };
        const fields = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
        const values = [...Object.values(updates), id];
        (await db.prepare(`UPDATE announcements SET ${fields} WHERE id = ?`).run(...values));
    }
    finally {
        db.close();
    }
}
export async function deleteAnnouncement(id: number): Promise<void> {
    const db = getDb();
    try {
        (await db.prepare("DELETE FROM announcements WHERE id = ?").run(id));
    }
    finally {
        db.close();
    }
}
export async function listAnnouncements(): Promise<AnnouncementRow[]> {
    const db = getDb();
    try {
        return (await db.prepare("SELECT * FROM announcements ORDER BY pinned DESC, created_at DESC").all()) as AnnouncementRow[];
    }
    finally {
        db.close();
    }
}
export async function getActiveAnnouncements(locale?: string): Promise<AnnouncementRow[]> {
    const db = getDb();
    try {
        if (locale) {
            return (await db.prepare("SELECT * FROM announcements WHERE active = 1 AND (locale = 'all' OR locale = ?) ORDER BY pinned DESC, created_at DESC").all(locale)) as AnnouncementRow[];
        }
        return (await db.prepare("SELECT * FROM announcements WHERE active = 1 ORDER BY pinned DESC, created_at DESC").all()) as AnnouncementRow[];
    }
    finally {
        db.close();
    }
}
// ─────────────────────────────────────────────────────────
// Feedback
// ─────────────────────────────────────────────────────────
export type FeedbackRow = {
    id: number;
    content: string;
    contact: string;
    locale: string;
    status: "new" | "reviewed";
    created_at: number;
};
export async function createFeedback(content: string, contact: string, locale: string): Promise<number> {
    const db = getDb();
    try {
        const result = (await db.prepare("INSERT INTO feedbacks (content, contact, locale, status, created_at) VALUES (?, ?, ?, 'new', ?)").run(content, contact, locale, Date.now()));
        return Number(result.lastInsertRowid);
    }
    finally {
        db.close();
    }
}
export async function listFeedbacks(): Promise<FeedbackRow[]> {
    const db = getDb();
    try {
        return (await db.prepare("SELECT * FROM feedbacks ORDER BY CASE status WHEN 'new' THEN 0 ELSE 1 END, created_at DESC").all()) as FeedbackRow[];
    }
    finally {
        db.close();
    }
}
export async function updateFeedbackStatus(id: number, status: FeedbackRow["status"]): Promise<void> {
    const db = getDb();
    try {
        (await db.prepare("UPDATE feedbacks SET status = ? WHERE id = ?").run(status, id));
    }
    finally {
        db.close();
    }
}
export async function deleteFeedback(id: number): Promise<void> {
    const db = getDb();
    try {
        (await db.prepare("DELETE FROM feedbacks WHERE id = ?").run(id));
    }
    finally {
        db.close();
    }
}
