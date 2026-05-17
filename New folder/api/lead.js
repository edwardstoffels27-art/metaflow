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

    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

    await sendResendRequest("/emails", {
      from,
      to: email,
      subject: "[PDF] Your 7-Day Metabolic Reset Guide is inside...",
      html: `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:32px">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
            <p style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#0891b2;margin:0 0 12px">MetaFlow Confirmation</p>
            <h1 style="font-size:28px;line-height:1.1;margin:0 0 16px">Your 7-Day Metabolic Reset, ${name}.</h1>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              As we cross the age 40 milestone, our bodies begin to play by a different set of rules. The strategies which worked in your 20s—restrictive dieting or intense cardio—don't seem to move the needle anymore. That's because your "Metabolic Clock" is desynchronized.
            </p>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              I've attached your guide below. It contains 7 simple, daily shifts designed to re-align your internal rhythm for better blood sugar support and natural energy.
            </p>
            <a href="${AFFILIATE_URL}" style="display:inline-block;background:#22d3ee;color:#0f172a;font-weight:800;text-decoration:none;border-radius:999px;padding:14px 22px">
              Download Your 7-Day Reset Guide PDF
            </a>
            <p style="font-size:14px;font-weight:700;color:#0f172a;margin:24px 0 12px">The Shortcut:</p>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              While these habits are foundational, many of our community members want to accelerate the process. If you're tired of the "trial and error" and want to see the PhD-formulated system that targets these pathways at a cellular level, you can view the breakdown here:
            </p>
            <a href="${AFFILIATE_URL}" style="display:inline-block;background:#0f172a;color:#ffffff;font-weight:700;text-decoration:none;border-radius:999px;padding:14px 22px">
              See How MetaFlow Works (60% Off for New Members)
            </a>
            <p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0">
              To your health,<br>The GetMetaFlow Team
            </p>
          </div>
        </div>
      `,
    });

    await sendResendRequest("/emails", {
      from,
      to: email,
      subject: "Why 3:00 PM is the 'Danger Zone' for your metabolism",
      send_at: in24h,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:32px">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
            <h1 style="font-size:28px;line-height:1.1;margin:0 0 16px">Why 3:00 PM is the "Danger Zone" for your metabolism</h1>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              It happens like clockwork, doesn't it? The clock hits 3:00 PM, and suddenly the "Brain Fog" rolls in. You reach for a second (or third) coffee, or perhaps something sugary, just to make it through the final hours of the workday.
            </p>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              Most people think this is just "getting older." It's not. This crash is a clinical sign of Metabolic Inflexibility. Your body is struggling to switch between burning sugars and burning stored fats for fuel. Instead of a steady flow of energy, you're on a roller coaster.
            </p>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              MetaFlow was engineered specifically to bridge this gap. By synchronizing your Cognitive-Metabolic Loop, it helps maintain "level" energy from the moment you wake up until you put your head on the pillow. No jitters. No crashes. Just clarity.
            </p>
            <a href="${AFFILIATE_URL}" style="display:inline-block;background:#0f172a;color:#ffffff;font-weight:700;text-decoration:none;border-radius:999px;padding:14px 22px">
              Read the Science Behind the MetaFlow Loop
            </a>
            <p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0">
              Speak soon,<br>The GetMetaFlow Team
            </p>
          </div>
        </div>
      `,
    });

    await sendResendRequest("/emails", {
      from,
      to: email,
      subject: "A message from the lab (Regarding your 'Cellular Clock')",
      send_at: in48h,
      html: `
        <div style="font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;padding:32px">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
            <h1 style="font-size:28px;line-height:1.1;margin:0 0 16px">A message from the lab</h1>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              When we first started the research that led to MetaFlow, we didn't want to create another "weight loss" supplement. The market is already full of those. We wanted to solve a deeper problem: The Circadian-Metabolic Desync.
            </p>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              Our lead formulators discovered that after age 45, the "switches" that control your cellular energy production become "sticky." They don't flip as easily as they used to. MetaFlow contains a precise blend of ingredients that act as a "lubricant" for these biological switches.
            </p>
            <p style="font-size:16px;line-height:1.6;color:#475569;margin:0 0 22px">
              <strong>Why we offer a 60-Day "Empty Bottle" Guarantee:</strong> We know that for many in our community, you've been let down by "miracle cures" before. We want to remove that weight from your shoulders. Try MetaFlow for two full months. If you don't feel a profound shift in your mental clarity and metabolic fire, we will refund every penny—even if you've used every single drop.
            </p>
            <a href="${AFFILIATE_URL}" style="display:inline-block;background:#22d3ee;color:#0f172a;font-weight:800;text-decoration:none;border-radius:999px;padding:14px 22px">
              Claim Your Risk-Free Supply & 60% Discount
            </a>
            <p style="font-size:13px;line-height:1.6;color:#64748b;margin:24px 0 0">
              To your peak performance,<br>The GetMetaFlow Team
            </p>
            <p style="font-size:13px;line-height:1.6;color:#64748b;margin:16px 0 0">
              P.S. Due to high demand from our recent features in health journals, current inventory for the 5-bottle "Best Value" pack is low. <a href="${AFFILIATE_URL}">Check availability here</a>.
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
