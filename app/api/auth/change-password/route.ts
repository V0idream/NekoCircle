import { NextResponse } from "next/server";
import { initDb, getSetting, setSetting } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { trustedAdminMutation, allowAdminLogin } from '@/lib/admin-request';
import { validPasswordHash } from '@/lib/password';
export async function POST(req: Request) {
    if (!trustedAdminMutation(req))
        return NextResponse.json({ error: '请求来源无效' }, { status: 403 });
    if (!allowAdminLogin(req))
        return NextResponse.json({ error: '尝试次数过多，请稍后再试' }, { status: 429 });
    try {
        initDb();
        const { oldPassword, newPassword } = await req.json();
        if (!oldPassword || !newPassword)
            return NextResponse.json({ error: "请填写旧密码和新密码" }, { status: 400 });
        if (String(newPassword).length < 6)
            return NextResponse.json({ error: "新密码至少 6 位" }, { status: 400 });
        const stored = (await getSetting("admin_password_hash"));
        if (!validPasswordHash(stored))
            return NextResponse.json({ error: "尚未设置管理员密码" }, { status: 400 });
        const ok = await verifyPassword(String(oldPassword), stored);
        if (!ok)
            return NextResponse.json({ error: "旧密码错误" }, { status: 401 });
        const hash = await hashPassword(String(newPassword));
        (await setSetting("admin_password_hash", hash));
        return NextResponse.json({ ok: true });
    }
    catch {
        return NextResponse.json({ error: "服务器错误" }, { status: 500 });
    }
}
