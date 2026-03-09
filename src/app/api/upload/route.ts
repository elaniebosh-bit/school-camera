import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

export const runtime = "nodejs";

const MAX_SHOTS = 10;

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return Response.json({ error: "Missing auth token" }, { status: 401 });
    }

    const admin = supabaseAdmin();

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes.user) {
      return Response.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = userRes.user.id;

    const form = await req.formData();
    const eventId = String(form.get("eventId") || "");
    const file = form.get("file") as File | null;

    if (!eventId) {
      return Response.json({ error: "Missing eventId" }, { status: 400 });
    }

    if (!file) {
      return Response.json({ error: "Missing file" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return Response.json({ error: "File must be an image" }, { status: 400 });
    }

    const evRes = await admin
      .from("events")
      .select("id,active")
      .eq("id", eventId)
      .single();

    if (evRes.error || !evRes.data) {
      return Response.json({ error: "Event not found" }, { status: 404 });
    }

    const { data: adminRow } = await admin
      .from("admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    const isAdmin = !!adminRow;

    let shotsUsed = 0;

    if (!isAdmin) {
      const shotsRes = await admin
        .from("user_event_shots")
        .select("shots_used")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();

      shotsUsed = shotsRes.data?.shots_used ?? 0;

      if (shotsUsed >= MAX_SHOTS) {
        return Response.json(
          { error: `Shot limit reached (${MAX_SHOTS})` },
          { status: 403 }
        );
      }
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    const fullJpeg = await sharp(inputBuffer)
      .rotate()
      .jpeg({ quality: 85 })
      .toBuffer();

    const thumbJpeg = await sharp(fullJpeg)
      .resize({ width: 600, withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const photoId = crypto.randomUUID();
    const origKey = `events/${eventId}/${photoId}.jpg`;
    const thumbKey = `events/${eventId}/${photoId}_thumb.jpg`;

    const bucket = process.env.R2_BUCKET_NAME!;
    const r2 = r2Client();

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: origKey,
        Body: fullJpeg,
        ContentType: "image/jpeg",
      })
    );

    await r2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbKey,
        Body: thumbJpeg,
        ContentType: "image/jpeg",
      })
    );

    const ins = await admin
      .from("photos")
      .insert({
        id: photoId,
        event_id: eventId,
        owner_id: userId,
        drive_file_id: origKey,
        drive_thumb_file_id: thumbKey,
      })
      .select("id")
      .single();

    if (ins.error) {
      return Response.json({ error: ins.error.message }, { status: 400 });
    }

    if (!isAdmin) {
      const nextShots = shotsUsed + 1;

      const existing = await admin
        .from("user_event_shots")
        .select("event_id,user_id")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();

      if (existing.data) {
        await admin
          .from("user_event_shots")
          .update({ shots_used: nextShots })
          .eq("event_id", eventId)
          .eq("user_id", userId);
      } else {
        await admin.from("user_event_shots").insert({
          event_id: eventId,
          user_id: userId,
          shots_used: 1,
        });
      }
    }

    return Response.json({ ok: true, photoId }, { status: 200 });
  } catch (err: any) {
    console.error("UPLOAD ERROR:", err);
    return Response.json(
      { error: err?.message ?? "Upload failed" },
      { status: 500 }
    );
  }
}