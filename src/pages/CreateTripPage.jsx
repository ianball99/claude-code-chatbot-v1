import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

function parseDate(input) {
  if (!input) return null;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (!y) y = String(new Date().getFullYear());
    else if (y.length === 2) y = "20" + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d+[\/\-\.]?$/.test(s)) return null;
  const parsed = new Date(s);
  if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
  return null;
}

function formatDateForDisplay(isoDate) {
  if (!isoDate) return "";
  try {
    return new Date(isoDate).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

async function callMcpTool(toolName, toolInput = {}) {
  const res = await fetch("/.netlify/functions/mcp-tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolName, toolInput }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.result;
}

async function addTripToIndex(email, trip) {
  try {
    await fetch("/.netlify/functions/trip-index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", email, trip }),
    });
  } catch {
    // Non-fatal
  }
}

function generateRefCode() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    "trip" +
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

export default function CreateTripPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [startDateInput, setStartDateInput] = useState("");
  const [endDateInput, setEndDateInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState("");

  const startDateIso = parseDate(startDateInput);
  const endDateIso = parseDate(endDateInput);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) { setError("Please enter a trip title."); return; }
    if (!startDateIso) { setError("Please enter a valid start date."); return; }
    if (!endDateIso) { setError("Please enter a valid end date."); return; }
    if (endDateIso < startDateIso) { setError("End date must be on or after the start date."); return; }

    setLoading(true);
    const refCode = generateRefCode();
    const email = localStorage.getItem("vamoos_user_email") || "";

    try {
      setLoadingStep("Creating trip...");
      const createResult = await callMcpTool("create_itinerary", {
        reference_code: refCode,
        departure_date: startDateIso,
        return_date: endDateIso,
        field1: title.trim(),
      });

      let vamoosId = null;
      try {
        const parsed = JSON.parse(createResult);
        vamoosId = parsed.vamoos_id ?? parsed.id ?? null;
      } catch {}

      setLoadingStep("Adding details...");
      const [, imageResult] = await Promise.allSettled([
        callMcpTool("add_person_to_itinerary", {
          reference_code: refCode,
          name: email,
          email,
        }),
        fetch("/.netlify/functions/generate-trip-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim() }),
        }).then((r) => r.json()),
      ]);

      if (imageResult.status === "fulfilled" && imageResult.value?.imageData) {
        if (!vamoosId) {
          try {
            const getResult = await callMcpTool("get_itinerary", { reference_code: refCode });
            const getParsed = JSON.parse(getResult);
            vamoosId = getParsed.vamoos_id ?? getParsed.id ?? null;
          } catch {}
        }
        if (vamoosId) {
          setLoadingStep("Uploading background...");
          const { imageData, contentType, filename } = imageResult.value;
          try {
            await callMcpTool("upload_background_image", {
              reference_code: refCode,
              vamoos_id: vamoosId,
              departure_date: startDateIso,
              return_date: endDateIso,
              file_data: imageData,
              filename,
              content_type: contentType,
            });
          } catch (bgErr) {
            console.warn("Background upload failed:", bgErr.message);
          }
        }
      }

      if (email) {
        setLoadingStep("Saving...");
        await addTripToIndex(email, {
          refCode,
          title: title.trim(),
          departureDate: startDateIso,
          returnDate: endDateIso,
        });
      }

      setLoadingStep("Opening trip...");
      navigate(`/trip/${encodeURIComponent(refCode)}`, {
        state: { title: title.trim(), startDate: startDateIso },
      });
    } catch (e) {
      setError(e.message || "Failed to create trip. Please try again.");
      setLoading(false);
      setLoadingStep("");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#3a3a3a]">
      <div className="flex items-center gap-3 border-b border-[#505050] px-4 py-3">
        <button
          onClick={() => navigate("/home")}
          className="text-white hover:text-[#ff7c46] transition-colors"
          disabled={loading}
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <h1 className="text-base font-medium text-white">New Trip</h1>
      </div>

      <div className="flex flex-col items-center pt-10 pb-6">
        <img src="/vamoos-logo-and-text-transparent-white-v.png" alt="Vamoos" className="h-16 w-auto" />
      </div>

      <div className="flex flex-1 flex-col items-center px-8 pt-4">
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm text-[#c0c0c0] px-1">Trip Title</label>
            <input
              type="text"
              placeholder="e.g. Morocco Adventure"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              className="w-full rounded-full border border-[#808080] bg-transparent px-6 py-3 text-white placeholder-[#808080] focus:border-[#ff7c46] focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm text-[#c0c0c0] px-1">Start Date</label>
            <input
              type="text"
              placeholder="e.g. 1/4/26 or 2026-04-01"
              value={startDateInput}
              onChange={(e) => setStartDateInput(e.target.value)}
              disabled={loading}
              className="w-full rounded-full border border-[#808080] bg-transparent px-6 py-3 text-white placeholder-[#808080] focus:border-[#ff7c46] focus:outline-none transition-colors disabled:opacity-50"
            />
            {startDateInput && (
              <p className={`text-xs px-2 ${startDateIso ? "text-[#ff7c46]" : "text-red-400"}`}>
                {startDateIso ? formatDateForDisplay(startDateIso) : "Date not recognised"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm text-[#c0c0c0] px-1">End Date</label>
            <input
              type="text"
              placeholder="e.g. 10/4/26 or 2026-04-10"
              value={endDateInput}
              onChange={(e) => setEndDateInput(e.target.value)}
              disabled={loading}
              className="w-full rounded-full border border-[#808080] bg-transparent px-6 py-3 text-white placeholder-[#808080] focus:border-[#ff7c46] focus:outline-none transition-colors disabled:opacity-50"
            />
            {endDateInput && (
              <p className={`text-xs px-2 ${endDateIso ? "text-[#ff7c46]" : "text-red-400"}`}>
                {endDateIso ? formatDateForDisplay(endDateIso) : "Date not recognised"}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-red-400 px-2">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-[#ff7c46] py-3 text-lg font-medium text-white hover:bg-[#e06b35] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (loadingStep || "Creating trip...") : "Create Trip"}
          </button>
        </form>
      </div>
    </div>
  );
}
