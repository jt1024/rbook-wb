import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, issueSession } from "@/lib/adminSession";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "服务端未配置 ADMIN_PASSWORD" }, { status: 500 });
  }
  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!safeEqual(password, expected)) {
    return NextResponse.json({ error: "口令不正确" }, { status: 401 });
  }

  const { token, maxAge } = issueSession();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
  return NextResponse.json({ ok: true });
}
