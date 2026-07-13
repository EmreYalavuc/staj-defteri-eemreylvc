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

export async function GET() {
  try {
    const data = await redis().get<DiaryEntry[]>(REDIS_KEY);
    return NextResponse.json(data ?? []);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entry: DiaryEntry = await req.json();
  const db = redis();
  const current = (await db.get<DiaryEntry[]>(REDIS_KEY)) ?? [];
  const updated = [...current, entry];
  await db.set(REDIS_KEY, updated);
  return NextResponse.json(entry, { status: 201 });
}
