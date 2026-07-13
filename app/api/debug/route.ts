import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

export async function GET() {
  const envCheck = {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? "✓ var" : "✗ eksik",
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? "✓ var" : "✗ eksik",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? "✓ var" : "✗ eksik",
  };

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    await redis.ping();
    return NextResponse.json({ ...envCheck, redis: "✓ bağlantı başarılı" });
  } catch (err) {
    return NextResponse.json({ ...envCheck, redis: `✗ hata: ${String(err)}` });
  }
}
