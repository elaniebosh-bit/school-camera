"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    async function finishAuth() {
      try {
        // This lets Supabase process the magic-link session in the URL
        await supabase.auth.getSession();

        if (!mounted) return;
        router.replace("/");
      } catch (e) {
        console.error("Auth callback error:", e);
        if (!mounted) return;
        router.replace("/");
      }
    }

    finishAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  return <div style={{ padding: 20 }}>Signing you in…</div>;
}