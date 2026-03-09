"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type EventRow = {
  id: string;
  name: string;
  starts_at: string;
  unlocks_at: string;
  active: boolean;
};

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  async function refreshSignedInData(sess: Session) {
    const adminRes = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", sess.user.id)
      .maybeSingle();

    setIsAdmin(!adminRes.error && !!adminRes.data);

    const evRes = await supabase
      .from("events")
      .select("id,name,starts_at,unlocks_at,active")
      .eq("active", true)
      .order("starts_at", { ascending: true });

    if (!evRes.error) {
      setEvents((evRes.data ?? []) as EventRow[]);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const sess = data.session ?? null;
      setSession(sess);
      if (sess) refreshSignedInData(sess);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
      const s = sess ?? null;
      setSession(s);
      if (s) {
        refreshSignedInData(s);
      } else {
        setEvents([]);
        setIsAdmin(false);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function sendMagicLink() {
    if (!email.trim()) return;

    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        alert(error.message);
      } else {
        alert("Magic link sent. Check your email.");
      }
    } finally {
      setSending(false);
    }
  }

  if (!session) {
    return (
      <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
        <h1>Volkie Moments</h1>
        <p>Sign in with your email to access event cameras and galleries.</p>

        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
            marginBottom: 10,
          }}
        />

        <button
          disabled={sending || !email.trim()}
          onClick={sendMagicLink}
          style={{ padding: "10px 12px", borderRadius: 10 }}
        >
          {sending ? "Sending…" : "Send magic link"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1>Active events</h1>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 14,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          Signed in as: <b>{session.user.email}</b>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isAdmin && (
            <a
              href="/admin"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #ccc",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Admin panel
            </a>
          )}

          <button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            style={{ padding: "10px 12px", borderRadius: 10 }}
          >
            Sign out
          </button>

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              setEmail("");
              setEvents([]);
              setIsAdmin(false);
            }}
            style={{ padding: "10px 12px", borderRadius: 10 }}
          >
            Use different email
          </button>
        </div>

        <p style={{ marginTop: 10, opacity: 0.75, fontSize: 14 }}>
          Come back later in the same browser and you should usually still be signed in.
          If not, sign out and request a new magic link.
        </p>
      </div>

      {events.length === 0 ? (
        <p>No active events right now.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {events.map((ev) => (
            <a
              key={ev.id}
              href={`/event/${ev.id}`}
              style={{
                display: "block",
                border: "1px solid #ddd",
                borderRadius: 14,
                padding: 14,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 18 }}>{ev.name}</div>
              <div style={{ opacity: 0.8 }}>
                Starts: {new Date(ev.starts_at).toLocaleString()}
              </div>
              <div style={{ opacity: 0.8 }}>
                Gallery opens: {new Date(ev.unlocks_at).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}