"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

type EventRow = {
  id: string;
  name: string;
  starts_at: string;
  unlocks_at: string;
  active: boolean;
};

type ShotsRow = {
  event_id: string;
  user_id: string;
  shots_used: number;
};

type PhotoRow = {
  id: string;
  owner_id: string;
  created_at: string;
};

const MAX_SHOTS = 10;

function Thumb({ photoId, token }: { photoId: string; token: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;

    async function run() {
      try {
        setErr(null);
        setUrl(null);

        const res = await fetch(`/api/photos/${photoId}/thumb`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `thumb failed (${res.status})`);
        }

        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);

        if (alive) setUrl(objectUrl);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Thumbnail error");
      }
    }

    run();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId, token]);

  if (err) {
    return (
      <div
        style={{
          height: 180,
          border: "1px solid #eee",
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          color: "crimson",
          fontSize: 12,
          textAlign: "center",
          padding: 10,
        }}
      >
        Thumbnail error
        <br />
        <span style={{ opacity: 0.8 }}>{err}</span>
      </div>
    );
  }

  if (!url) {
    return (
      <div
        style={{
          height: 180,
          border: "1px solid #eee",
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          opacity: 0.7,
          fontSize: 12,
        }}
      >
        Loading thumbnail…
      </div>
    );
  }

  return (
    <img
      src={url}
      alt="thumbnail"
      style={{
        width: "100%",
        height: 180,
        objectFit: "cover",
        borderRadius: 10,
        border: "1px solid #eee",
        display: "block",
      }}
    />
  );
}

export default function EventPage() {
  const router = useRouter();
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;

  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [shotsUsed, setShotsUsed] = useState(0);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const unlocked = useMemo(() => {
    if (!event) return false;
    return new Date(event.unlocks_at).getTime() <= Date.now();
  }, [event]);

  const shotsLeft = useMemo(() => Math.max(0, MAX_SHOTS - shotsUsed), [shotsUsed]);

  async function refreshAll(sess: Session) {
    if (!eventId) return;

    const evRes = await supabase
      .from("events")
      .select("id,name,starts_at,unlocks_at,active")
      .eq("id", eventId)
      .single();

    if (evRes.error) {
      alert(`Could not load event: ${evRes.error.message}`);
      router.replace("/");
      return;
    }
    setEvent(evRes.data as EventRow);

    const adminRes = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", sess.user.id)
      .maybeSingle();

    setIsAdmin(!adminRes.error && !!adminRes.data);

    const shotsRes = await supabase
      .from("user_event_shots")
      .select("event_id,user_id,shots_used")
      .eq("event_id", eventId)
      .eq("user_id", sess.user.id)
      .maybeSingle();

    if (!shotsRes.error && shotsRes.data) {
      setShotsUsed((shotsRes.data as ShotsRow).shots_used ?? 0);
    } else {
      setShotsUsed(0);
    }

    const photosRes = await supabase
      .from("photos")
      .select("id,owner_id,created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (!photosRes.error) setPhotos((photosRes.data ?? []) as PhotoRow[]);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session ?? null;
      setSession(sess);
      setLoading(false);
      if (sess) refreshAll(sess);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, sess) => {
      const s = sess ?? null;
      setSession(s);
      if (s) refreshAll(s);
      else setPhotos([]);
    });

    return () => data.subscription.unsubscribe();
  }, [eventId]);

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  if (!session) {
    return (
      <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
        <h1>Event</h1>
        <p>You need to sign in first.</p>
        <button
          onClick={() => router.replace("/")}
          style={{ padding: "10px 12px", borderRadius: 10 }}
        >
          Go to login
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <button
        onClick={() => router.push("/")}
        style={{ padding: "10px 12px", borderRadius: 10 }}
      >
        ← Back
      </button>

      {!event ? (
        <div style={{ paddingTop: 20 }}>Loading event…</div>
      ) : (
        <>
          <h1 style={{ marginBottom: 6 }}>{event.name}</h1>
          <div style={{ opacity: 0.85 }}>
            <div>Starts: {new Date(event.starts_at).toLocaleString()}</div>
            <div>Unlocks: {new Date(event.unlocks_at).toLocaleString()}</div>
            <div>
              Status:{" "}
              <b>
                {isAdmin
                  ? "Admin (always access)"
                  : unlocked
                  ? "Unlocked"
                  : "Locked (gallery opens later)"}
              </b>
            </div>
          </div>

          <hr style={{ margin: "18px 0" }} />

          <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Disposable camera</h2>
            <p style={{ marginTop: 0 }}>
              You have <b>{shotsLeft}</b> / {MAX_SHOTS} photos left.
            </p>

            {!isAdmin && shotsLeft === 0 ? (
              <p style={{ color: "crimson" }}>
                You’ve used all {MAX_SHOTS} photos for this event.
              </p>
            ) : (
              <>
                <button
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ padding: "10px 12px", borderRadius: 10 }}
                >
                  {busy ? "Uploading…" : "Take / upload photo"}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;

                    setBusy(true);
                    try {
                      const form = new FormData();
                      form.append("eventId", eventId);
                      form.append("file", file);

                      const res = await fetch("/api/upload", {
                        method: "POST",
                        headers: { Authorization: `Bearer ${session.access_token}` },
                        body: form,
                      });

                      const json = await res.json().catch(() => null);

                      if (!res.ok) {
                        alert(json?.error ?? `Upload failed (${res.status})`);
                        return;
                      }

                      await refreshAll(session);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />

                <p style={{ opacity: 0.8, marginTop: 10 }}>
                  Note: users won’t see photo previews here. The shared gallery shows after unlock time.
                </p>
              </>
            )}
          </div>

          <hr style={{ margin: "18px 0" }} />

          <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Gallery</h2>

            {!isAdmin && !unlocked ? (
              <p>
                The gallery is locked. It will open at:{" "}
                <b>{new Date(event.unlocks_at).toLocaleString()}</b>
              </p>
            ) : photos.length === 0 ? (
              <p>No photos yet.</p>
            ) : (
              <>
                <p style={{ opacity: 0.8 }}>Showing {photos.length} photos.</p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: 12,
                  }}
                >
                  {photos.map((p) => {
                    const mine = p.owner_id === session.user.id;

                    return (
                      <div
                        key={p.id}
                        style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}
                      >
                        <div style={{ fontWeight: 700 }}>{mine ? "Your photo" : "Photo"}</div>
                        <div style={{ opacity: 0.8, fontSize: 13 }}>
                          {new Date(p.created_at).toLocaleString()}
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <Thumb photoId={p.id} token={session.access_token} />
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/photos/${p.id}/download`, {
                                  headers: {
                                    Authorization: `Bearer ${session.access_token}`,
                                  },
                                });

                                if (!res.ok) {
                                  const t = await res.text().catch(() => "");
                                  alert(t || `Download failed (${res.status})`);
                                  return;
                                }

                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);

                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `photo-${p.id}.jpg`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();

                                setTimeout(() => URL.revokeObjectURL(url), 1000);
                              } catch (e: any) {
                                alert(e?.message ?? "Download failed");
                              }
                            }}
                            style={{ padding: "8px 10px", borderRadius: 10 }}
                          >
                            Download
                          </button>

                          {isAdmin && (
                            <button
                              onClick={async () => {
                                const ok = window.confirm("Delete this photo permanently?");
                                if (!ok) return;

                                try {
                                  const res = await fetch(`/api/photos/${p.id}/delete`, {
                                    method: "POST",
                                    headers: {
                                      Authorization: `Bearer ${session.access_token}`,
                                    },
                                  });

                                  if (!res.ok) {
                                    const t = await res.text().catch(() => "");
                                    alert(t || `Delete failed (${res.status})`);
                                    return;
                                  }

                                  await refreshAll(session);
                                } catch (e: any) {
                                  alert(e?.message ?? "Delete failed");
                                }
                              }}
                              style={{ padding: "8px 10px", borderRadius: 10 }}
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                          id: {p.id.slice(0, 8)}…
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}