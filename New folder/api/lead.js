const RESEND_API_BASE_URL = "https://api.resend.com";
const AFFILIATE_URL = process.env.AFFILIATE_URL || "https://l1nq.com/nrnyrkw";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function sendResendRequest(path, payload) {
  const response = await fetch(`${RESEND_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || "Resend email request failed.");
  }
  return result;
}

async function createContact({ email, firstName }) {
  const payload = {
    email,
    firstName,
    unsubscribed: false,
    properties: {
      source: "MetaFlow landing page",
      affiliateUrl: AFFILIATE_URL,
    },
  };

  if (process.env.RESEND_SEGMENT_ID) {
    payload.segments = [{ id: process.env.RESEND_SEGMENT_ID }];
  }

  try {
    await sendResendRequest("/contacts", payload);
  } catch (error) {
    if (!/exist|duplicate|already/i.test(error.message)) {
      throw error;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed." });
  }

  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return json(res, 500, { error: "Email service is not configured." });
  }

  try {
    const body = await readJson(req);
    const rawName = String(body.name || "").trim().slice(0, 80);
    const name = escapeHtml(rawName || "there");
    const email = String(body.email || "").trim().toLowerCase();

    if (!isEmail(email)) {
      return json(res, 400, { error: "Please enter a valid email address." });
    }

    const from = process.env.RESEND_FROM_EMAIL;
    const notifyTo = process.env.LEAD_NOTIFY_EMAIL || from;
    const safeEmail = escapeHtml(email);

    await createContact({ email, firstName: rawName || undefined });

    await sendResendRequest("/emails", {
      from,
      to: email,
      subject: "Your MetaFlow discount link is inside",
      html: `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:32px">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
            <p style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0891b2;margin:0 0 12px">MetaFlow Confirmation</p>
            <h1 style="font-size:28px;line-height:1.1;margin:0 0 16px">Your discount link is ready, ${name}.</h1>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              Thanks for checking out MetaFlow. Use the secure link below to view today's discounted bottle options while the flash sale is still active.
            </p>
            <a href="${AFFILIATE_URL}" style="display:inline-block;background:#22d3ee;color:#0f172a;font-weight:800;text-decoration:none;border-radius:999px;padding:14px 22px">
              Claim MetaFlow Discount
            </a>
            <p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0">
              You are receiving this because you requested the MetaFlow offer confirmation. This message is informational and does not provide medical advice.
            </p>
          </div>
        </div>
      `,
    });

    await sendResendRequest("/emails", {
      from,
      to: notifyTo,
      subject: "New MetaFlow lead",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0f172a">
          <h1>New MetaFlow lead</h1>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Affiliate link:</strong> <a href="${AFFILIATE_URL}">${AFFILIATE_URL}</a></p>
        </div>
      `,
    });

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error.message || "Email failed to send." });
  }
}
