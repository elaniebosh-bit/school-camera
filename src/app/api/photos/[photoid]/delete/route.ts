import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

export const runtime = "nodejs";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

function getBearerToken(req: NextRequest) {
  const h = req.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ photoid: string }> }
) {
  try {
    const { photoid } = await params;
    const photoId = photoid;

    if (!photoId) {
      return new Response("Missing photoId", { status: 400 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return new Response("Missing auth token", { status: 401 });
    }

    const sb = supabaseAdmin();

    const userRes = await sb.auth.getUser(token);
    if (userRes.error || !userRes.data.user) {
      return new Response("Invalid token", { status: 401 });
    }

    const userId = userRes.data.user.id;

    // Admin only
    const adminRes = await sb
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!adminRes.data) {
      return new Response("Forbidden", { status: 403 });
    }

    // Load photo row first
    const photoRes = await sb
      .from("photos")
      .select("id, drive_file_id, drive_thumb_file_id")
      .eq("id", photoId)
      .single();

    if (photoRes.error || !photoRes.data) {
      return new Response(
        `Photo not found: ${photoRes.error?.message ?? "no row"}`,
        { status: 404 }
      );
    }

    const photo = photoRes.data;
    const s3 = r2Client();
    const bucket = process.env.R2_BUCKET_NAME!;

    // Delete original if present
    if (photo.drive_file_id) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: photo.drive_file_id,
        })
      );
    }

    // Delete thumbnail if present
    if (photo.drive_thumb_file_id) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: photo.drive_thumb_file_id,
        })
      );
    }

    // Delete DB row
    const delRes = await sb.from("photos").delete().eq("id", photoId);

    if (delRes.error) {
      return new Response(`DB delete failed: ${delRes.error.message}`, {
        status: 500,
      });
    }

    return Response.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE ERROR:", e);
    return new Response(`Delete route error: ${e?.message ?? String(e)}`, {
      status: 500,
    });
  }
}