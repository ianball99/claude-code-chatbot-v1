import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import VerifyPage from "./pages/VerifyPage";
import HomePage from "./pages/HomePage";
import TripPage from "./pages/TripPage";
import CreateTripPage from "./pages/CreateTripPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/trip/:refCode" element={<TripPage />} />
        <Route path="/create-trip" element={<CreateTripPage />} />
      </Routes>
    </BrowserRouter>
  );
}
