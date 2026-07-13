import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? "✓ var" : "✗ eksik",
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? "✓ var" : "✗ eksik",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ? "✓ var" : "✗ eksik",
  });
}
