"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "../../lib/supabaseClient";

type EventRow = {
  id: string;
  name: string;
  starts_at: string;
  unlocks_at: string;
  active: boolean;
};

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function AdminPage() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [unlocksAt, setUnlocksAt] = useState("");
  const [busy, setBusy] = useState(false);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  const nowLocal = useMemo(() => {
    const now = new Date();
    return toDatetimeLocalValue(now);
  }, []);

  const plus48Local = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() + 48);
    return toDatetimeLocalValue(d);
  }, []);

  useEffect(() => {
    setStartsAt((prev) => prev || nowLocal);
    setUnlocksAt((prev) => prev || plus48Local);
  }, [nowLocal, plus48Local]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function refresh() {
    const { data, error } = await supabase
      .from("events")
      .select("id,name,starts_at,unlocks_at,active")
      .order("starts_at", { ascending: false });

    if (!error) setEvents((data ?? []) as EventRow[]);
  }

  useEffect(() => {
    (async () => {
      if (!session) return;

      const { data, error } = await supabase
        .from("admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setIsAdmin(!error && !!data);
      await refresh();
    })();
  }, [session]);

  if (!session) {
    return <div style={{ padding: 20 }}>Please sign in first.</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: 20 }}>Not an admin.</div>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <h1>Admin Panel</h1>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Create event</h2>

        <label style={{ display: "block", marginBottom: 8 }}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 10 }}
            placeholder="Amajuba Sports Week Day 1"
          />
        </label>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <label style={{ display: "block" }}>
            Starts at
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </label>

          <label style={{ display: "block" }}>
            Unlocks at
            <input
              type="datetime-local"
              value={unlocksAt}
              onChange={(e) => setUnlocksAt(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
            />
          </label>
        </div>

        <button
          disabled={busy || !name.trim() || !startsAt || !unlocksAt}
          onClick={async () => {
            setBusy(true);
            try {
              const { error } = await supabase.from("events").insert({
                name: name.trim(),
                starts_at: new Date(startsAt).toISOString(),
                unlocks_at: new Date(unlocksAt).toISOString(),
                active: true,
              });

              if (error) {
                alert(error.message);
              } else {
                setName("");
                setStartsAt(nowLocal);
                setUnlocksAt(plus48Local);
                await refresh();
              }
            } finally {
              setBusy(false);
            }
          }}
          style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10 }}
        >
          {busy ? "Creating…" : "Create event"}
        </button>
      </div>

      <h2>Events</h2>

      {events.length === 0 ? (
        <p>No events yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {events.map((ev) => {
            const eventUrl = `${origin}/event/${ev.id}`;

            return (
              <div
                key={ev.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 1fr",
                    gap: 16,
                    alignItems: "start",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>
                      {ev.name}
                    </div>
                    <div style={{ opacity: 0.8 }}>
                      Starts: {new Date(ev.starts_at).toLocaleString()}
                    </div>
                    <div style={{ opacity: 0.8 }}>
                      Unlocks: {new Date(ev.unlocks_at).toLocaleString()}
                    </div>
                    <div style={{ opacity: 0.8, marginBottom: 12 }}>
                      Active: {ev.active ? "Yes" : "No"}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                        marginBottom: 12,
                      }}
                    >
                      <button
                        onClick={async () => {
                          const { error } = await supabase
                            .from("events")
                            .update({ active: !ev.active })
                            .eq("id", ev.id);

                          if (error) alert(error.message);
                          else await refresh();
                        }}
                        style={{ padding: "10px 12px", borderRadius: 10 }}
                      >
                        Set {ev.active ? "Inactive" : "Active"}
                      </button>

                      <a
                        href={`/event/${ev.id}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        Open event
                      </a>

                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(eventUrl);
                            alert("Event link copied.");
                          } catch {
                            alert("Could not copy link.");
                          }
                        }}
                        style={{ padding: "10px 12px", borderRadius: 10 }}
                      >
                        Copy event link
                      </button>
                    </div>

                    <div
                      style={{
                        wordBreak: "break-all",
                        fontSize: 13,
                        opacity: 0.75,
                      }}
                    >
                      {eventUrl}
                    </div>
                  </div>

                  <div
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 12,
                      padding: 12,
                      display: "grid",
                      placeItems: "center",
                      background: "#fff",
                    }}
                  >
                    <QRCodeSVG value={eventUrl} size={180} />
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        opacity: 0.75,
                        textAlign: "center",
                      }}
                    >
                      Scan to open this event
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}