import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Plus, LogOut, ChevronRight } from "lucide-react";

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const email = localStorage.getItem("vamoos_user_email") || "";

  const loadTrips = async () => {
    if (!email) { setTrips([]); setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/.netlify/functions/trip-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get", email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setTrips(data.trips || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTrips(); }, []);

  const handleSignOut = () => {
    localStorage.removeItem("vamoos_user_email");
    navigate("/");
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#5a5a5a] text-white overflow-hidden">
      <div className="shrink-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[#707070]">
          <div className="flex flex-col">
            <img src="/vamoos-logo-and-text-transparent-white-v.png" alt="Vamoos" className="h-10 w-auto" />
            {email && <div className="text-[11px] text-[#a0a0a0]">{email}</div>}
          </div>
        </div>

        <button
          onClick={loadTrips}
          className="flex items-center gap-4 w-full px-4 py-4 text-[#ff7c46] hover:opacity-80 transition-opacity"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} strokeWidth={2} />
          <span className="text-[17px]">Refresh</span>
        </button>

        <div className="mx-4 border-t border-[#707070]" />

        <button
          onClick={() => navigate("/create-trip")}
          className="flex items-center gap-4 w-full px-4 py-5 text-[#ff7c46] hover:opacity-80 transition-opacity"
        >
          <Plus className="h-5 w-5" strokeWidth={2} />
          <span className="text-[17px]">Add new trip or event</span>
        </button>

        <div className="px-4 pb-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-[#ff7c46] hover:opacity-80 transition-opacity text-[15px]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        <div className="bg-[#4a4a4a] px-4 py-3 border-t border-[#707070] flex items-center justify-between">
          <h2 className="text-base font-medium text-white">Your Trips</h2>
          {!loading && trips.length > 0 && (
            <span className="text-xs font-mono text-[#808080] bg-[#3d3d3d] px-2 py-0.5 rounded-full">
              {trips.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#4a4a4a]">
        {loading && (
          <div className="flex items-center justify-center py-12 text-[#a0a0a0] text-sm">
            Loading trips…
          </div>
        )}

        {error && !loading && (
          <div className="px-4 py-4 text-sm text-red-400">
            <p className="mb-2">Error loading trips: {error}</p>
            <button onClick={loadTrips} className="text-[#ff7c46] underline">Retry</button>
          </div>
        )}

        {!loading && !error && trips.length === 0 && (
          <div className="px-4 py-8 text-center text-[#a0a0a0] text-sm">
            <p>No trips found. Tap "Add new trip or event" to get started.</p>
          </div>
        )}

        {!loading && trips.length > 0 && (
          <div className="flex flex-col">
            {trips.map((trip, i) => (
              <button
                key={trip.refCode || i}
                onClick={() => navigate(`/trip/${encodeURIComponent(trip.refCode)}`)}
                className="group flex items-center justify-between w-full px-4 py-4 text-left hover:bg-[#555555] transition-colors border-b border-[#505050]/40 border-l-[3px] border-l-transparent hover:border-l-[#ff7c46]"
              >
                <div>
                  <div className="text-[#c0c0c0] text-[15px] group-hover:text-white transition-colors">{trip.title}</div>
                  {trip.departureDate && (
                    <div className="text-[#808080] text-[12px] mt-0.5">
                      {formatDate(trip.departureDate)}
                      {trip.returnDate ? ` – ${formatDate(trip.returnDate)}` : ""}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-[#707070] group-hover:text-[#ff7c46] transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
