"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, KeyRound, Loader2, Plus } from "lucide-react";
import {
  PROVIDERS,
  modelsForProvider,
  type Provider,
} from "@/lib/pricing";

const PROVIDER_IDS = Object.keys(PROVIDERS) as Provider[];

const inputClass =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:outline-none focus:ring-2 focus:ring-accent/40";

export default function AddKeyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [baseUrl, setBaseUrl] = useState(PROVIDERS.anthropic.baseUrl);
  const [model, setModel] = useState(
    modelsForProvider("anthropic")[0]?.id ?? ""
  );
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = useMemo(() => modelsForProvider(provider), [provider]);
  const info = PROVIDERS[provider];

  // Live pricing (daily-cached server-side); static table values until loaded.
  const [livePricing, setLivePricing] = useState<
    Record<string, { input: number; output: number }> | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.pricing) setLivePricing(d.pricing);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const priceLabel = (id: string, fallbackIn: number, fallbackOut: number) => {
    const p = livePricing?.[id];
    const fmt = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(2));
    return `$${fmt(p?.input ?? fallbackIn)} / $${fmt(p?.output ?? fallbackOut)} per 1M`;
  };

  function onProviderChange(next: Provider) {
    setProvider(next);
    setBaseUrl(PROVIDERS[next].baseUrl);
    setModel(modelsForProvider(next)[0]?.id ?? "");
    setApiKey("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, baseUrl, model, apiKey, label }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save key");
        return;
      }
      setApiKey("");
      setLabel("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition-colors duration-150 hover:opacity-90"
      >
        <Plus size={16} aria-hidden />
        Add key
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mm-fade-in rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-ink-dim" aria-hidden />
        <h2 className="text-sm font-medium tracking-tight text-ink">
          Add API key
        </h2>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-ink-dim">Provider</label>
          <select
            value={provider}
            onChange={(e) => onProviderChange(e.target.value as Provider)}
            className={inputClass}
          >
            {PROVIDER_IDS.map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-ink-dim">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={inputClass}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {priceLabel(m.id, m.input, m.output)}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs text-ink-dim">Base URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            readOnly={provider !== "custom"}
            placeholder="https://api.example.com/v1"
            className={`${inputClass} font-mono ${
              provider !== "custom" ? "opacity-60" : ""
            }`}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs text-ink-dim">API key</label>
            {info.keyUrl && (
              <a
                href={info.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                Get a key
                <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={info.keyPlaceholder}
            autoComplete="off"
            className={`${inputClass} font-mono`}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs text-ink-dim">
            Label <span className="text-ink-dim/60">(optional)</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Personal OpenAI"
            maxLength={80}
            className={inputClass}
          />
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-err">{error}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !apiKey.trim() || !model || !baseUrl.trim()}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          Save key
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim transition-colors duration-150 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
