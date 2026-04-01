import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import VerifyPage from "./pages/VerifyPage";
import HomePage from "./pages/HomePage";
import TripPage from "./pages/TripPage";
import CreateTripPage from "./pages/CreateTripPage";

function getBrowserId() {
  let id = localStorage.getItem("vamoos_browser_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("vamoos_browser_id", id);
  }
  return id;
}

function AuthGuard() {
  const email = localStorage.getItem("vamoos_user_email");
  const browserId = getBrowserId();
  const [status, setStatus] = useState("checking"); // "checking" | "ok" | "fail"

  useEffect(() => {
    if (!email) {
      setStatus("fail");
      return;
    }

    fetch("/.netlify/functions/check-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, browserId }),
    })
      .then((res) => res.json())
      .then((data) => setStatus(data.verified ? "ok" : "fail"))
      .catch(() => setStatus("fail"));
  }, [email, browserId]);

  if (status === "checking") return null;

  if (status === "fail") {
    localStorage.removeItem("vamoos_user_email");
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export default function App() {
  // Ensure a browser ID is generated on first load
  getBrowserId();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route element={<AuthGuard />}>
          <Route path="/home" element={<HomePage />} />
          <Route path="/trip/:refCode" element={<TripPage />} />
          <Route path="/create-trip" element={<CreateTripPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
