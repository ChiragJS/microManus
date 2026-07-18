"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Ticket,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowLeft,
} from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/wordmark";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

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
  paymentResult = null,
}: {
  initialCredits: number;
  initialUnlocked: boolean;
  couponRedeemed: boolean;
  email: string | null;
  success: boolean;
  sessionId: string | null;
  canceled: boolean;
  /** server-side verdict when returning from Stripe (null = undetermined) */
  paymentResult?: "success" | "failed" | null;
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
  /** Stripe embedded-checkout client secret — non-null renders the modal */
  const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);

  // payment-return state (spinner only when the server verdict is undetermined)
  const [confirming, setConfirming] = useState(
    paymentResult === null && success && Boolean(sessionId)
  );

  const ranConfirm = useRef(false);

  // Payment successful — brief confirmation, then continue to the app.
  useEffect(() => {
    if (paymentResult !== "success") return;
    const t = setTimeout(() => router.replace("/chat"), 2200);
    return () => clearTimeout(t);
  }, [paymentResult, router]);

  // Handle ?success=1&session_id=... — client confirm/poll fallback, only when
  // the server couldn't determine the outcome (Stripe hiccup during render).
  useEffect(() => {
    if (paymentResult !== null) return;
    if (!success || !sessionId || ranConfirm.current) return;
    ranConfirm.current = true;

    let cancelledFlag = false;

    async function run() {
      setConfirming(true);

      // Confirm the checkout session server-side. This is idempotent with the
      // webhook — whichever runs first credits; the other is a no-op that still
      // returns ok. If it reports ok, crediting is done: go straight to chat.
      try {
        const res = await fetch("/api/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          credits?: number;
        } | null;
        if (res.ok && data?.ok) {
          if (typeof data.credits === "number") setCredits(data.credits);
          router.replace("/chat");
          return;
        }
      } catch {
        // fall through to polling — the webhook may still credit
      }

      // Fallback: poll for the webhook having unlocked the account. NOTE: do
      // not compare against a page-load baseline — the webhook often credits
      // BEFORE Stripe redirects back, so the baseline already includes the
      // new credits and a "> baseline" check would spin forever.
      for (let i = 0; i < 15 && !cancelledFlag; i++) {
        try {
          const res = await fetch("/api/me", { cache: "no-store" });
          if (res.ok) {
            const me: MeResponse = await res.json();
            setCredits(me.credits);
            if (me.unlocked && me.credits > 0) {
              router.replace("/chat");
              return;
            }
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
      if (res.status === 401) {
        // Session expired — re-authenticate and come back.
        window.location.href = "/login?next=/paywall";
        return;
      }
      const data = await res.json();
      if (data?.clientSecret) {
        setCheckoutSecret(data.clientSecret);
      } else {
        setPayError("Could not start checkout. Try again.");
      }
    } catch {
      setPayError("Network error. Try again.");
    } finally {
      setPayLoading(false);
    }
  }

  const closeCheckout = useCallback(() => setCheckoutSecret(null), []);

  // Esc closes the checkout modal
  useEffect(() => {
    if (!checkoutSecret) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeCheckout();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkoutSecret, closeCheckout]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const heading = alreadyUnlocked ? "Top up credits" : "Unlock MicroManus";

  // ---- Payment result screens (server verdict) ----
  if (paymentResult === "success") {
    return (
      <Shell>
        <div className="mm-pop-in flex flex-col items-center gap-4 py-8 text-center">
          <span className="mm-scale-in flex h-14 w-14 items-center justify-center rounded-full bg-ok/15">
            <CheckCircle2 size={30} className="text-ok" />
          </span>
          <div>
            <p className="text-lg font-medium tracking-tight">Payment successful</p>
            <p className="mt-1 text-sm text-ink-dim">
              5 credits added — balance{" "}
              <span className="font-mono text-ink">{credits}</span>
            </p>
          </div>
          <p className="text-xs text-ink-dim">Taking you to your workspace…</p>
          <button
            type="button"
            onClick={() => router.replace("/chat")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity duration-150 hover:opacity-90"
          >
            Continue now
          </button>
        </div>
      </Shell>
    );
  }

  if (paymentResult === "failed") {
    return (
      <Shell>
        <div className="mm-pop-in flex flex-col items-center gap-4 py-8 text-center">
          <span className="mm-scale-in flex h-14 w-14 items-center justify-center rounded-full bg-err/15">
            <AlertCircle size={30} className="text-err" />
          </span>
          <div>
            <p className="text-lg font-medium tracking-tight">Payment failed</p>
            <p className="mt-1 text-sm text-ink-dim">
              The payment didn&apos;t complete — you were not charged.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.replace("/paywall")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity duration-150 hover:opacity-90"
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

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
      {/* Embedded Stripe Checkout modal */}
      {checkoutSecret && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm"
          onClick={closeCheckout}
        >
          <div
            className="relative mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-medium text-ink">
                MicroManus — 5 research credits · $5
              </span>
              <button
                type="button"
                onClick={closeCheckout}
                aria-label="Close checkout"
                className="rounded-md p-1.5 text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto bg-white">
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ clientSecret: checkoutSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        </div>
      )}

      {/* Back to app — only when already unlocked (locked users can't skip the paywall) */}
      {alreadyUnlocked && (
        <button
          type="button"
          onClick={() => router.push("/chat")}
          className="mb-4 -ml-1 flex items-center gap-1.5 text-sm text-ink-dim transition-colors hover:text-ink"
        >
          <ArrowLeft size={15} />
          Back to chat
        </button>
      )}

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
