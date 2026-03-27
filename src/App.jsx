import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import VerifyPage from "./pages/VerifyPage";
import HomePage from "./pages/HomePage";
import TripPage from "./pages/TripPage";
import AddTripPage from "./pages/AddTripPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/trip/:refCode" element={<TripPage />} />
        <Route path="/add-trip" element={<AddTripPage />} />
      </Routes>
    </BrowserRouter>
  );
}
