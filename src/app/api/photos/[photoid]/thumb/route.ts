import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

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

async function bodyToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.from([]);

  if (typeof body.transformToByteArray === "function") {
    const arr = await body.transformToByteArray();
    return Buffer.from(arr);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ photoid: string }> }
) {
  try {
    const { photoid } = await params;
    const photoId = photoid;

    if (!photoId) {
      return new Response("Photo not found: missing photoId", { status: 404 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return new Response("Missing auth token", { status: 401 });
    }

    const sb = supabaseAdmin();

    const userRes = await sb.auth.getUser(token);
    if (userRes.error || !userRes.data.user) {
      return new Response(
        `Invalid token: ${userRes.error?.message ?? "no user"}`,
        { status: 401 }
      );
    }

    const userId = userRes.data.user.id;

    const photoRes = await sb
      .from("photos")
      .select("id, event_id, owner_id, drive_thumb_file_id")
      .eq("id", photoId)
      .single();

    if (photoRes.error || !photoRes.data) {
      return new Response(
        `Photo not found: ${photoRes.error?.message ?? "no row"}`,
        { status: 404 }
      );
    }

    const photo = photoRes.data;

    const adminRes = await sb
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    const isAdmin = !!adminRes.data;

    // IMPORTANT: gallery rule for thumbnails
    // - admin can always view
    // - non-admin can view ANY thumbnail only after unlock
    if (!isAdmin) {
      const eventRes = await sb
        .from("events")
        .select("unlocks_at")
        .eq("id", photo.event_id)
        .single();

      if (eventRes.error || !eventRes.data) {
        return new Response("Event not found", { status: 404 });
      }

      const unlocked =
        new Date(eventRes.data.unlocks_at).getTime() <= Date.now();

      if (!unlocked) {
        return new Response("Gallery locked", { status: 403 });
      }
    }

    const thumbKey = photo.drive_thumb_file_id;
    if (!thumbKey) {
      return new Response("Thumbnail not ready", { status: 404 });
    }

    const s3 = r2Client();
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: thumbKey,
      })
    );

    const buf = await bodyToBuffer(obj.Body);

    if (!buf.length) {
      return new Response("Thumbnail missing/empty in R2", { status: 404 });
    }

    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": obj.ContentType || "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (e: any) {
    console.error("THUMB ERROR:", e);
    return new Response(`Thumb route error: ${e?.message ?? String(e)}`, {
      status: 500,
    });
  }
}