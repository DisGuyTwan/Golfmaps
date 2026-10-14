/**
 * Client error reports (see src/lib/report-error.ts). They are written to the
 * function log, so they show up in Vercel's runtime logs without a third-party
 * service or API key. Payloads are capped and reduced to known fields.
 */
const MAX_BYTES = 4096;

export async function POST(request: Request) {
  const text = (await request.text()).slice(0, MAX_BYTES);
  let report: Record<string, unknown> = {};
  try {
    report = JSON.parse(text);
  } catch {
    report = { message: text };
  }
  const pick = (key: string) => (typeof report[key] === "string" ? (report[key] as string).slice(0, 1000) : undefined);
  console.error(
    "[client-error]",
    JSON.stringify({
      kind: pick("kind"),
      message: pick("message"),
      stack: pick("stack"),
      url: pick("url"),
      ua: request.headers.get("user-agent")?.slice(0, 200),
    }),
  );
  return new Response(null, { status: 204 });
}
