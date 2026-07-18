"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Ticket,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/wordmark";

type MeResponse = {
  credits: number;
  unlocked: boolean;
  coupon_redeemed: boolean;
  email: string | null;
};

export function PaywallClient({
  initialCredits,
  initialUnlocked,
  couponRedeemed,
  email,
  success,
  sessionId,
  canceled,
}: {
  initialCredits: number;
  initialUnlocked: boolean;
  couponRedeemed: boolean;
  email: string | null;
  success: boolean;
  sessionId: string | null;
  canceled: boolean;
}) {
  const router = useRouter();
  const alreadyUnlocked = initialUnlocked && initialCredits > 0;

  const [credits, setCredits] = useState(initialCredits);
  const [redeemed, setRedeemed] = useState(couponRedeemed);

  // coupon state
  const [code, setCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponOk, setCouponOk] = useState(false);

  // checkout state
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // payment-return state
  const [confirming, setConfirming] = useState(success && Boolean(sessionId));

  const ranConfirm = useRef(false);

  // Handle ?success=1&session_id=... — confirm + poll until credited.
  useEffect(() => {
    if (!success || !sessionId || ranConfirm.current) return;
    ranConfirm.current = true;

    let cancelledFlag = false;

    async function run() {
      setConfirming(true);
      // Fallback crediting in case the webhook lags.
      try {
        await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // ignore — polling below will still catch webhook crediting
      }

      const baseline = initialCredits;
      for (let i = 0; i < 15 && !cancelledFlag; i++) {
        try {
          const res = await fetch("/api/me", { cache: "no-store" });
          if (res.ok) {
            const me: MeResponse = await res.json();
            if (me.unlocked && me.credits > baseline) {
              setCredits(me.credits);
              router.replace("/chat");
              return;
            }
            setCredits(me.credits);
          }
        } catch {
          // keep polling
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      // Give up gracefully — let the user retry.
      if (!cancelledFlag) setConfirming(false);
    }

    run();
    return () => {
      cancelledFlag = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function redeem() {
    if (!code.trim() || couponLoading) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch("/api/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (data?.ok) {
        setCouponOk(true);
        setRedeemed(true);
        if (typeof data.credits === "number") setCredits(data.credits);
        setTimeout(() => router.replace("/chat"), 1000);
      } else {
        setCouponError(data?.error ?? "Could not redeem coupon");
      }
    } catch {
      setCouponError("Network error. Try again.");
    } finally {
      setCouponLoading(false);
    }
  }

  async function payWithCard() {
    if (payLoading) return;
    setPayLoading(true);
    setPayError(null);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        setPayError("Could not start checkout. Try again.");
        setPayLoading(false);
      }
    } catch {
      setPayError("Network error. Try again.");
      setPayLoading(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const heading = alreadyUnlocked ? "Top up credits" : "Unlock MicroManus";

  // ---- Payment-received / confirming overlay ----
  if (confirming) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <Loader2 size={28} className="animate-spin text-accent" />
          <div>
            <p className="text-lg font-medium tracking-tight">
              Payment received — unlocking…
            </p>
            <p className="mt-1 text-sm text-ink-dim">
              Crediting your account. This takes a moment.
            </p>
          </div>
          <span className="font-mono text-sm text-ink-dim">
            credits:{" "}
            <span className="text-ink">{credits}</span>
          </span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 text-center">
        <div className="mb-1 font-mono text-xs uppercase tracking-widest text-accent">
          {alreadyUnlocked ? "Top up" : "Paywall"}
        </div>
        <h1 className="text-2xl font-medium tracking-tight">{heading}</h1>
        <p className="mt-1 text-sm text-ink-dim">
          5 research credits — 1 credit per research run.
        </p>
        {alreadyUnlocked && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 font-mono text-xs text-ink-dim">
            current balance
            <span className="text-ink">{credits}</span>
            credits
          </p>
        )}
      </div>

      {canceled && (
        <p className="mb-4 text-center text-sm text-ink-dim">
          Payment canceled — no charge was made.
        </p>
      )}

      {/* Option A — pay */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={payWithCard}
          disabled={payLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-bg transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {payLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <CreditCard size={16} />
          )}
          Pay $5 with card
        </button>
        {payError && <p className="text-sm text-err">{payError}</p>}
        <p className="text-center font-mono text-xs text-ink-dim">
          Test mode — use card 4242 4242 4242 4242, any future date & CVC.
        </p>
      </div>

      {/* divider */}
      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-xs text-ink-dim">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Option B — coupon */}
      {redeemed && !couponOk ? (
        <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-ink-dim">
          <span className="inline-flex items-center gap-2">
            <Ticket size={15} />
            Coupon already redeemed on this account.
          </span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            redeem();
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Coupon code"
              disabled={couponLoading || couponOk}
              autoCapitalize="characters"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm text-ink placeholder:text-ink-dim/60 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={couponLoading || couponOk || !code.trim()}
              className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium text-ink transition-colors duration-150 hover:border-ink-dim disabled:cursor-not-allowed disabled:opacity-50"
            >
              {couponLoading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                "Redeem"
              )}
            </button>
          </div>
          {couponOk && (
            <p className="flex items-center gap-1.5 text-sm text-ok">
              <CheckCircle2 size={15} />
              Redeemed — unlocking…
            </p>
          )}
          {couponError && (
            <p className="flex items-center gap-1.5 text-sm text-err">
              <AlertCircle size={15} />
              {couponError}
            </p>
          )}
        </form>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
        <span className="truncate font-mono text-xs text-ink-dim">
          {email ?? "signed in"}
        </span>
        <button
          type="button"
          onClick={signOut}
          className="text-xs text-ink-dim underline-offset-2 transition-colors duration-150 hover:text-ink hover:underline"
        >
          Sign out
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-bg px-6 py-12 text-ink">
      <div className="mb-8">
        <Wordmark size="lg" />
      </div>
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8">
        {children}
      </div>
    </div>
  );
}
