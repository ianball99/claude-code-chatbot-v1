import React from "react";
import { useNavigate } from "react-router-dom";

export default function VerifyPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#3a3a3a]">
      {/* Logo */}
      <div className="flex flex-col items-center pt-16 pb-8">
        <img src="/vamoos-logo-and-text-transparent.png" alt="Vamoos" className="h-20 w-auto" />
      </div>

      <div className="flex flex-1 flex-col items-center px-8 pt-12">
        <div className="text-5xl mb-6">✉️</div>
        <p className="mb-2 text-center text-xl text-white">Check your email</p>
        <p className="mb-10 text-center text-sm text-[#a0a0a0]">
          We sent a verification link to your email address.
        </p>
        <button
          onClick={() => navigate("/home")}
          className="w-full max-w-sm rounded-full bg-[#f57c00] py-3 text-lg font-medium text-white hover:bg-[#e06c00] transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
