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
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const [email, setEmail] = useState("");
  const [sendingMagic, setSendingMagic] = useState(false);
  const [startingAnon, setStartingAnon] = useState(false);

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

  async function continueAnonymously() {
    setStartingAnon(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        alert(error.message);
      }
    } finally {
      setStartingAnon(false);
    }
  }

  async function sendAdminMagicLink() {
    if (!email.trim()) return;

    setSendingMagic(true);
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
        alert("Admin magic link sent. Check your email.");
      }
    } finally {
      setSendingMagic(false);
    }
  }

  if (!session) {
    return (
      <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
        <h1>Volkie Moments</h1>
        <p>
          Capture the event with a disposable-camera style gallery.
        </p>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Attendees</h2>
          <p style={{ marginTop: 0 }}>
            Use this on the same phone/browser now and later to access your gallery.
          </p>

          <button
            disabled={startingAnon}
            onClick={continueAnonymously}
            style={{ padding: "10px 12px", borderRadius: 10 }}
          >
            {startingAnon ? "Starting…" : "Continue to event"}
          </button>

          <p style={{ marginTop: 12, opacity: 0.75, fontSize: 14 }}>
            Important: anonymous access is tied to this browser. If you sign out,
            clear browser data, or use a different phone/browser later, you may lose
            access to your personal download rights.
          </p>
        </div>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Admins</h2>
          <p style={{ marginTop: 0 }}>
            Admins can sign in with email for full access.
          </p>

          <input
            type="email"
            placeholder="admin@example.com"
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
            disabled={sendingMagic || !email.trim()}
            onClick={sendAdminMagicLink}
            style={{ padding: "10px 12px", borderRadius: 10 }}
          >
            {sendingMagic ? "Sending…" : "Send admin magic link"}
          </button>
        </div>
      </div>
    );
  }

  const isAnonymous = !!session.user.is_anonymous;

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
          Signed in as:{" "}
          <b>
            {isAnonymous
              ? "Anonymous attendee"
              : session.user.email ?? "User"}
          </b>
        </div>

        {isAnonymous ? (
          <p style={{ marginTop: 0, opacity: 0.75, fontSize: 14 }}>
            Stay on this same device/browser if you want to come back later for the
            unlocked gallery and your own downloads.
          </p>
        ) : null}

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
        </div>
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