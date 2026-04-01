import { getStore } from "@netlify/blobs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { email } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "A valid email address is required" }),
    };
  }

  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!siteID || !token) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Server configuration error" }),
    };
  }

  if (!resendApiKey) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Email service not configured" }),
    };
  }

  const store = getStore({ name: "otp-store", siteID, token });
  const key = encodeURIComponent(email.toLowerCase().trim());

  // Rate-limit: reject if a valid (unexpired) OTP already exists
  try {
    const existing = await store.get(key);
    if (existing) {
      const parsed = JSON.parse(existing);
      if (Date.now() < parsed.expiresAt) {
        return {
          statusCode: 429,
          headers: CORS,
          body: JSON.stringify({
            error: "A code was already sent. Please wait before requesting another.",
          }),
        };
      }
    }
  } catch {
    // No existing record, continue
  }

  // Generate 6-digit code
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Store OTP
  await store.set(key, JSON.stringify({ code, expiresAt }));

  // Send email via Resend
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "Vamoos Chatbot <onboarding@resend.dev>",
      to: [email],
      subject: "Your verification code",
      text: `Your verification code is: ${code}\n\nThis code expires in 5 minutes. If you did not request this, you can ignore this email.`,
    }),
  });

  if (!emailRes.ok) {
    // Clean up stored OTP so user can retry
    await store.delete(key).catch(() => {});
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Failed to send verification email. Please try again." }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({ success: true }),
  };
};
