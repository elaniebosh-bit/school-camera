"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

type EventRow = {
  id: string;
  name: string;
  starts_at: string;
  unlocks_at: string;
  active: boolean;
};

export default function AdminPage() {
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [unlocksAt, setUnlocksAt] = useState("");
  const [busy, setBusy] = useState(false);

  const nowLocal = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
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
      // check admin by trying to read admins table (RLS only allows admins)
      const { error } = await supabase.from("admins").select("user_id").limit(1);
      setIsAdmin(!error);
      await refresh();
    })();
  }, [session]);

  if (!session) return <div style={{ padding: 20 }}>Please sign in first.</div>;
  if (!isAdmin) return <div style={{ padding: 20 }}>Not an admin.</div>;

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <h1>Admin Panel</h1>

      <div style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14, marginBottom: 16 }}>
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

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "block" }}>
            Starts at
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10 }}
              defaultValue={nowLocal}
            />
          </label>

          <label style={{ display: "block" }}>
            Unlocks at (48h later)
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

              if (error) alert(error.message);
              else {
                setName("");
                setStartsAt("");
                setUnlocksAt("");
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

        <p style={{ opacity: 0.8, marginTop: 10 }}>
          Tip: set unlocksAt to startsAt + 48 hours for real events. For testing, set it a few minutes ahead.
        </p>
      </div>

      <h2>Events</h2>
      {events.length === 0 ? (
        <p>No events yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {events.map((ev) => (
            <div key={ev.id} style={{ border: "1px solid #ddd", borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{ev.name}</div>
                  <div style={{ opacity: 0.8 }}>Starts: {new Date(ev.starts_at).toLocaleString()}</div>
                  <div style={{ opacity: 0.8 }}>Unlocks: {new Date(ev.unlocks_at).toLocaleString()}</div>
                  <div style={{ opacity: 0.8 }}>Active: {ev.active ? "Yes" : "No"}</div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
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
                    style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", textDecoration: "none" }}
                  >
                    Open event
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
