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

  const { email, code, browserId } = body;

  if (!email || !code || !browserId) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "email, code, and browserId are required" }),
    };
  }

  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN;

  if (!siteID || !token) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Server configuration error" }),
    };
  }

  const otpStore = getStore({ name: "otp-store", siteID, token });
  const verificationStore = getStore({ name: "browser-verifications", siteID, token });
  const emailKey = encodeURIComponent(email.toLowerCase().trim());

  // Fetch stored OTP
  let record;
  try {
    const raw = await otpStore.get(emailKey);
    if (!raw) {
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: "No verification code found. Please request a new one." }),
      };
    }
    record = JSON.parse(raw);
  } catch {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "No verification code found. Please request a new one." }),
    };
  }

  // Check expiry
  if (Date.now() > record.expiresAt) {
    await otpStore.delete(emailKey).catch(() => {});
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Verification code has expired. Please request a new one." }),
    };
  }

  // Validate code
  if (record.code !== String(code).trim()) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Invalid verification code." }),
    };
  }

  // Success — delete OTP and write verification record
  await otpStore.delete(emailKey).catch(() => {});

  const verificationKey = `${encodeURIComponent(email.toLowerCase().trim())}:${encodeURIComponent(browserId)}`;
  await verificationStore.set(verificationKey, JSON.stringify({ verifiedAt: Date.now() }));

  return {
    statusCode: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
    body: JSON.stringify({ success: true }),
  };
};
