import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

async function checkVerified(email, browserId) {
  try {
    const res = await fetch("/.netlify/functions/check-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, browserId }),
    });
    const data = await res.json();
    return data.verified === true;
  } catch {
    return false;
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(1);
  const [verificationCode, setVerificationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    try {
      // If this browser is already verified for this email, skip OTP entirely
      const browserId = localStorage.getItem("vamoos_browser_id");
      const alreadyVerified = await checkVerified(email.trim(), browserId);
      if (alreadyVerified) {
        localStorage.setItem("vamoos_user_email", email.trim());
        navigate("/home");
        return;
      }

      const res = await fetch("/.netlify/functions/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        // A valid code was already sent — just advance so the user can enter it
        if (res.status === 429) {
          setStep(2);
          return;
        }
        setError(data.error || "Failed to send verification code. Please try again.");
        return;
      }

      setStep(2);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e) => {
    e.preventDefault();
    if (!verificationCode.trim()) return;

    setLoading(true);
    setError("");

    const browserId = localStorage.getItem("vamoos_browser_id");

    try {
      const res = await fetch("/.netlify/functions/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: verificationCode.trim(),
          browserId,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed. Please try again.");
        return;
      }

      localStorage.setItem("vamoos_user_email", email.trim());
      navigate("/home");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError("");
    setVerificationCode("");

    try {
      const res = await fetch("/.netlify/functions/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to resend code. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#3a3a3a]">
      {/* Logo */}
      <div className="flex flex-col items-center pt-16 pb-8">
        <img src="/vamoos-logo-and-text-transparent.png" alt="Vamoos" className="h-20 w-auto" />
      </div>

      {/* Step 1: Email */}
      {step === 1 && (
        <div className="flex flex-1 flex-col items-center px-8 pt-12">
          <p className="mb-8 text-center text-xl text-white leading-relaxed">
            Sign in to your account
          </p>
          <form onSubmit={handleEmailSubmit} className="w-full max-w-sm space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full rounded-full border border-[#808080] bg-transparent px-6 py-3 text-white placeholder-[#808080] focus:border-[#ff7c46] focus:outline-none transition-colors disabled:opacity-50"
            />
            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#ff7c46] py-3 text-lg font-medium text-white hover:bg-[#e06b35] transition-colors disabled:opacity-50"
            >
              {loading ? "Sending…" : "Next"}
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Verification */}
      {step === 2 && (
        <div className="flex flex-1 flex-col items-center px-8 pt-12">
          <p className="mb-2 text-center text-xl text-white leading-relaxed">
            Enter verification code
          </p>
          <p className="mb-8 text-center text-sm text-[#a0a0a0]">
            Sent to {email}
          </p>
          <form onSubmit={handleVerificationSubmit} className="w-full max-w-sm space-y-4">
            <input
              type="text"
              placeholder="6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
              disabled={loading}
              className="w-full rounded-full border border-[#808080] bg-transparent px-6 py-3 text-white placeholder-[#808080] focus:border-[#ff7c46] focus:outline-none transition-colors disabled:opacity-50"
            />
            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#ff7c46] py-3 text-lg font-medium text-white hover:bg-[#e06b35] transition-colors disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Sign In"}
            </button>
          </form>
          <button
            onClick={handleResend}
            disabled={loading}
            className="mt-4 text-[#ff7c46] hover:text-[#e06b35] transition-colors text-sm disabled:opacity-50"
          >
            Resend code
          </button>
          <button
            onClick={() => { setStep(1); setError(""); setVerificationCode(""); }}
            className="mt-3 text-[#808080] hover:text-[#a0a0a0] transition-colors text-sm"
          >
            Back to email
          </button>
        </div>
      )}
    </div>
  );
}
