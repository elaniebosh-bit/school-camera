"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type EventRow = {
  id: string;
  name: string;
  starts_at: string;
  unlocks_at: string;
};

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (!session) return;

      const { data, error } = await supabase
        .from("events")
        .select("id,name,starts_at,unlocks_at")
        .order("starts_at", { ascending: false });

      if (!error) setEvents((data ?? []) as EventRow[]);
      // If you get an RLS error here, it usually means RLS/policies aren’t applied yet.
    })();
  }, [session]);

  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  if (!session) {
    return (
      <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
        <h1>School Camera</h1>
        <p>Sign in to join an event.</p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          style={{ width: "100%", padding: 12, borderRadius: 10 }}
          autoComplete="email"
        />

        <button
          onClick={async () => {
            const trimmed = email.trim();
            if (!trimmed.includes("@")) return;

            setSending(true);
            try {
              const { error } = await supabase.auth.signInWithOtp({
                email: trimmed,
                options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
              });

              if (error) alert(error.message);
              else alert("Magic link sent! Check your email.");
            } finally {
              setSending(false);
            }
          }}
          style={{ width: "100%", padding: 12, borderRadius: 10, marginTop: 10 }}
          disabled={sending || !email.includes("@")}
        >
          {sending ? "Sending…" : "Send magic link"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
      <h1>Active events</h1>

      <button
        onClick={() => supabase.auth.signOut()}
        style={{ padding: "10px 12px", borderRadius: 10, marginBottom: 10 }}
      >
        Sign out
      </button>

      {events.length === 0 ? (
        <p>No active events right now.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {events.map((ev) => (
            <a
              key={ev.id}
              href={`/event/${ev.id}`}
              style={{
                border: "1px solid #ddd",
                borderRadius: 14,
                padding: 14,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 700 }}>{ev.name}</div>
              <div style={{ opacity: 0.8 }}>
                Starts: {new Date(ev.starts_at).toLocaleString()}
              </div>
              <div style={{ opacity: 0.8 }}>
                Unlocks: {new Date(ev.unlocks_at).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
