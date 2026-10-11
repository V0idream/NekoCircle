import { NextResponse } from "next/server";
import { initDb, getSetting } from "@/lib/db";
import { validPasswordHash } from '@/lib/password';
export async function GET() {
    initDb();
    const hash = (await getSetting("admin_password_hash"));
    // 只有 bcrypt 哈希（$2a$ 或 $2b$ 开头）才算有效，排除旧的明文密码残留
    const isValidHash = validPasswordHash(hash);
    return NextResponse.json({ hasAdmin: isValidHash });
}
