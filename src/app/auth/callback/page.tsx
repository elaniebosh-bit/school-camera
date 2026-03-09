"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let active = true;

    async function finishLogin() {
      try {
        const code = searchParams.get("code");

        if (!code) {
          setMessage("Login link is missing a code. Please request a new magic link.");
          return;
        }

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMessage(`Login failed: ${error.message}`);
          return;
        }

        if (!active) return;

        router.replace("/");
      } catch (e: any) {
        setMessage(`Login failed: ${e?.message ?? "Unknown error"}`);
      }
    }

    finishLogin();

    return () => {
      active = false;
    };
  }, [router, searchParams]);

  return <div style={{ padding: 20 }}>{message}</div>;
}