import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Plus, LogOut, ChevronRight } from "lucide-react";

const TRIP_LIST_KEY = (email) => `trip_list_${email.toLowerCase()}`;

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
  const email = localStorage.getItem("vamoos_user_email") || "";

  const loadTrips = () => {
    if (!email) { setTrips([]); return; }
    try {
      const stored = localStorage.getItem(TRIP_LIST_KEY(email));
      setTrips(stored ? JSON.parse(stored) : []);
    } catch {
      setTrips([]);
    }
  };

  useEffect(() => {
    loadTrips();
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("vamoos_user_email");
    navigate("/");
  };

  return (
    <div className="flex h-screen w-full flex-col bg-[#5a5a5a] text-white overflow-hidden">
      {/* Fixed top actions */}
      <div className="shrink-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-[#707070]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f57c00]">
            <span className="text-xl font-bold text-white">V</span>
          </div>
          <div>
            <div className="text-[#f57c00] font-bold tracking-wide">VAMOOS</div>
            {email && <div className="text-[11px] text-[#a0a0a0]">{email}</div>}
          </div>
        </div>

        {/* Action buttons */}
        <button
          onClick={loadTrips}
          className="flex items-center gap-4 w-full px-4 py-4 text-[#f57c00] hover:opacity-80 transition-opacity"
        >
          <RefreshCw className="h-5 w-5" strokeWidth={2} />
          <span className="text-[17px]">Refresh</span>
        </button>

        <div className="mx-4 border-t border-[#707070]" />

        {/* Add new trip */}
        <button
          onClick={() => navigate("/create-trip")}
          className="flex items-center gap-4 w-full px-4 py-5 text-[#f57c00] hover:opacity-80 transition-opacity"
        >
          <Plus className="h-5 w-5" strokeWidth={2} />
          <span className="text-[17px]">Add new trip or event</span>
        </button>

        {/* Sign out */}
        <div className="px-4 pb-3">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-[#f57c00] hover:opacity-80 transition-opacity text-[15px]"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        {/* Your Trips header */}
        <div className="bg-[#4a4a4a] px-4 py-3 border-t border-[#707070]">
          <h2 className="text-base font-medium text-white">Your Trips</h2>
        </div>
      </div>

      {/* Trip list — scrollable */}
      <div className="flex-1 overflow-y-auto bg-[#4a4a4a]">
        {trips.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#a0a0a0] text-sm">
            <p>No trips found. Tap "Add new trip or event" to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {trips.map((trip, i) => (
              <button
                key={trip.refCode || i}
                onClick={() => navigate(`/trip/${encodeURIComponent(trip.refCode)}`)}
                className="flex items-center justify-between w-full px-4 py-4 text-left hover:bg-[#555555] transition-colors border-b border-[#505050]/40"
              >
                <div>
                  <div className="text-[#c0c0c0] text-[15px]">{trip.title}</div>
                  {trip.departureDate && (
                    <div className="text-[#808080] text-[12px] mt-0.5">
                      {formatDate(trip.departureDate)}
                      {trip.returnDate ? ` – ${formatDate(trip.returnDate)}` : ""}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-[#707070] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
