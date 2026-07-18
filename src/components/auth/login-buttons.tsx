"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function GitHubLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function LoginButtons({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setFailed(null);
    try {
      const supabase = createClient();
      const redirectTo = `${location.origin}/auth/callback?next=${encodeURIComponent(
        next
      )}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo },
      });
      if (error) {
        setFailed(error.message);
        setLoading(false);
      }
      // On success the browser navigates to the provider; keep the spinner.
    } catch {
      setFailed("Could not start sign-in. Try again.");
      setLoading(false);
    }
  }

  const btn =
    "flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm font-medium text-ink transition-colors duration-150 hover:border-ink-dim disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={signIn} disabled={loading} className={btn}>
        {loading ? (
          <Loader2 size={18} className="animate-spin text-ink-dim" />
        ) : (
          <GitHubLogo />
        )}
        Continue with GitHub
      </button>

      {failed && (
        <p className="text-center text-sm text-err" role="alert">
          {failed}
        </p>
      )}
    </div>
  );
}
