import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";
import type { DiaryEntry } from "@/app/types";

const REDIS_KEY = "staj-entries";

function redis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

function isAuthed(req: NextRequest) {
  return (
    req.headers.get("authorization") === `Bearer ${process.env.ADMIN_PASSWORD}`
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = redis();
  const current = (await db.get<DiaryEntry[]>(REDIS_KEY)) ?? [];
  const updated = current
    .filter((e) => e.id !== params.id)
    .map((e, i) => ({ ...e, gun: i + 1 }));
  await db.set(REDIS_KEY, updated);
  return NextResponse.json({ success: true });
}
