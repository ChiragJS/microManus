import { NextResponse } from "next/server";
import { getLivePricing } from "@/lib/pricing-live";

/** GET — resolved live pricing table (daily-cached upstream) for UI display. */
export async function GET() {
  const table = await getLivePricing();
  return NextResponse.json(
    { pricing: table },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
