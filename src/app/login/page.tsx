import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { LoginButtons } from "@/components/auth/login-buttons";

function safeNext(next: string | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/chat";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const hasError = Boolean(params.error);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg text-ink">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Wordmark />
        </Link>
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-ink-dim transition-colors duration-150 hover:text-ink"
        >
          <ArrowLeft size={15} />
          Home
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-xl border border-line bg-surface p-8">
            <div className="mb-1 font-mono text-xs uppercase tracking-widest text-accent">
              Sign in
            </div>
            <h1 className="mb-1 text-2xl font-medium tracking-tight">
              Access MicroManus
            </h1>
            <p className="mb-6 text-sm text-ink-dim">
              Social login only. We never store a password.
            </p>

            {hasError && (
              <div className="mb-4 rounded-lg border border-err/40 bg-err/10 px-3 py-2 text-sm text-err">
                Sign-in failed. Please try again.
              </div>
            )}

            <LoginButtons next={next} />
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-ink-dim">
            By continuing you agree to bring your own LLM API key.
            <br />
            Unlock with a coupon or $5 after signing in.
          </p>
        </div>
      </main>
    </div>
  );
}
