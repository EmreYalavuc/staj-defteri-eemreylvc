import { put, del } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

function isAuthed(req: NextRequest) {
  return (
    req.headers.get("authorization") === `Bearer ${process.env.ADMIN_PASSWORD}`
  );
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const id = formData.get("id") as string;

  const blob = await put(`staj-images/${id}`, file, { access: "public" });
  return NextResponse.json({ url: blob.url });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { urls } = await req.json();
  if (urls?.length) await del(urls);
  return NextResponse.json({ success: true });
}
