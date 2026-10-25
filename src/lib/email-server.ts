/**
 * Emails to the rep (a client opened or accepted a proposal), sent with
 * Resend's REST API and the built-in fetch: RESEND_API_KEY, and the sender
 * in PROPOSAL_FROM ("Calculator <proposals@prodig-e.com>", a domain verified
 * in Resend; without one, Resend's test sender only reaches the account's
 * own address). Route handlers only. Without a key nothing is sent, and the
 * opens still show in the rep's list.
 */

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/** Sends one email; false when email isn't set up or Resend refused it (logged, never thrown). */
export async function sendEmail(mail: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.to)) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.PROPOSAL_FROM ?? "Calculator <onboarding@resend.dev>",
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html && { html: mail.html }),
        ...(mail.replyTo && { reply_to: mail.replyTo }),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email]", JSON.stringify({ status: res.status, body: (await res.text()).slice(0, 300) }));
    return res.ok;
  } catch (err) {
    console.error("[email]", String(err));
    return false;
  }
}

/** Escapes text for an email's HTML. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
