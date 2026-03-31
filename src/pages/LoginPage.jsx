import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState(1); // 1 = email, 2 = verification code
  const [verificationCode, setVerificationCode] = useState("");

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    if (email.trim()) {
      localStorage.setItem("vamoos_user_email", email.trim());
      setStep(2);
    }
  };

  const handleVerificationSubmit = (e) => {
    e.preventDefault();
    navigate("/home");
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
              className="w-full rounded-full border border-[#808080] bg-transparent px-6 py-3 text-white placeholder-[#808080] focus:border-[#f57c00] focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="w-full rounded-full bg-[#f57c00] py-3 text-lg font-medium text-white hover:bg-[#e06c00] transition-colors"
            >
              Next
            </button>
          </form>
        </div>
      )}

      {/* Step 2: Verification (skip-through) */}
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
              placeholder="Verification Code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              className="w-full rounded-full border border-[#808080] bg-transparent px-6 py-3 text-white placeholder-[#808080] focus:border-[#f57c00] focus:outline-none transition-colors"
            />
            <button
              type="submit"
              className="w-full rounded-full bg-[#f57c00] py-3 text-lg font-medium text-white hover:bg-[#e06c00] transition-colors"
            >
              Sign In
            </button>
          </form>
          <button
            onClick={() => setStep(1)}
            className="mt-6 text-[#808080] hover:text-[#a0a0a0] transition-colors text-sm"
          >
            Back to email
          </button>
        </div>
      )}
    </div>
  );
}
