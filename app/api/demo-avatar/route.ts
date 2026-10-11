import { NextResponse } from "next/server";
import { getDb } from '@/lib/db';

const DEMO_USER = "acnekot";
export async function GET() {
    const db = getDb();
    if (!db)
        return NextResponse.json({ url: null });
    try {
        const row = (await db
            .prepare("SELECT circle_data FROM yahoo_circles WHERE LOWER(username) = ? ORDER BY created_at DESC LIMIT 1")
            .get(DEMO_USER)) as {
            circle_data: string;
        } | undefined;
        db.close();
        if (!row)
            return NextResponse.json({ url: null });
        const data = JSON.parse(row.circle_data);
        const url: string | null = data.selfAvatarUrl || data.selfAvatarUrlPreview || null;
        return NextResponse.json({ url }, {
            headers: {
                "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200, max-age=3600",
            },
        });
    }
    catch {
        db.close();
        return NextResponse.json({ url: null });
    }
}
