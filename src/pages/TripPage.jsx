import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ChatPanel from "../components/ChatPanel";

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

async function registerTripForPerson(email, trip) {
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

export default function TripPage() {
  const { refCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const decodedRef = decodeURIComponent(refCode || "");

  const stateTitle = location.state?.title || "";
  const stateStartDate = location.state?.startDate || "";

  const [activeTab, setActiveTab] = useState("Details");
  const [splitPosition, setSplitPosition] = useState(50);
  const [detailsContent, setDetailsContent] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [summaryHtml, setSummaryHtml] = useState("");
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [tripTitle, setTripTitle] = useState(stateTitle || decodedRef);
  const [tripMeta, setTripMeta] = useState(null);

  const formatDetails = async (rawJson) => {
    try {
      const res = await fetch("/.netlify/functions/format-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripJson: rawJson }),
      });
      const data = await res.json();
      if (res.ok && data.text) return data.text;
    } catch {}
    return rawJson;
  };

  const containerRef = useRef(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!decodedRef) return;
    setDetailsLoading(true);
    callMcpTool("get_itinerary", { reference_code: decodedRef })
      .then(async (result) => {
        let parsed;
        try {
          parsed = JSON.parse(result);
        } catch {
          parsed = {};
        }

        const resolvedTitle = stateTitle || parsed.field1 || parsed.title || parsed.name || decodedRef;
        if (!stateTitle) setTripTitle(resolvedTitle);

        const meta = {
          vamoos_id: parsed.vamoos_id,
          departure_date: parsed.departure_date,
          return_date: parsed.return_date,
        };
        setTripMeta(meta);

        const travelFolder = (parsed.documents?.all || []).find(
          (f) => f.is_folder && f.path?.includes("/documents/travel")
        );
        const savedDoc = (travelFolder?.children || []).findLast(
          (d) => d.name?.startsWith("Trip Summary")
        );
        const docUrl = savedDoc?.file?.https_url;

        if (docUrl) {
          fetch("/.netlify/functions/fetch-document", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: docUrl }),
          })
            .then((r) => { if (!r.ok) throw new Error("fetch-document failed"); return r.text(); })
            .then((html) => { if (html.trim().startsWith("<")) setSummaryHtml(html); })
            .catch(() => {});
        } else {
          // No saved summary — generate one silently in the background
          setSummaryGenerating(true);
          fetch("/.netlify/functions/generate-summary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tripJson: result,
              reference_code: decodedRef,
              vamoos_id: meta.vamoos_id,
              departure_date: meta.departure_date || "",
              return_date: meta.return_date || "",
              trip_title: resolvedTitle,
            }),
          })
            .then((r) => r.json())
            .then((data) => { if (data.html) setSummaryHtml(data.html); })
            .catch(() => {})
            .finally(() => setSummaryGenerating(false));
        }

        const formatted = await formatDetails(result);
        setDetailsContent(formatted);
      })
      .catch((e) => setDetailsContent(`Error loading trip: ${e.message}`))
      .finally(() => setDetailsLoading(false));
  }, [decodedRef]);

  const handleTripMutated = useCallback(
    (toolName) => {
      const mutatingTools = [
        "update_itinerary", "add_flight_to_itinerary", "add_person_to_itinerary",
        "add_location_to_itinerary", "add_poi_and_attach_to_itinerary",
        "upload_background_image", "upload_document", "upload_gpx_and_attach_to_itinerary",
        "upload_created_html_itinerary_document",
      ];
      if (mutatingTools.includes(toolName)) {
        callMcpTool("get_itinerary", { reference_code: decodedRef })
          .then(async (result) => {
            const formatted = await formatDetails(result);
            setDetailsContent(formatted);
          })
          .catch(() => {});
      }
    },
    [decodedRef]
  );

  const handlePersonAdded = useCallback(
    (email, personRefCode) => {
      const ref = personRefCode || decodedRef;
      registerTripForPerson(email, {
        refCode: ref,
        title: tripTitle,
        departureDate: tripMeta?.departure_date || "",
        returnDate: tripMeta?.return_date || "",
      });
    },
    [decodedRef, tripTitle, tripMeta]
  );

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleMove = useCallback((clientY) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((clientY - rect.top) / rect.height) * 100;
    setSplitPosition(Math.min(80, Math.max(20, pct)));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    const onMove = (e) => handleMove(e.clientY);
    const onTouch = (e) => e.touches[0] && handleMove(e.touches[0].clientY);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("touchmove", onTouch);
    document.addEventListener("touchend", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", onTouch);
      document.removeEventListener("touchend", handleMouseUp);
    };
  }, [handleMove, handleMouseUp]);

  return (
    <div className="flex h-screen flex-col bg-[#3d3d3d]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#505050] px-4 py-3 shrink-0">
        <button onClick={() => navigate("/home")} className="text-white hover:text-[#ff7c46] transition-colors">
          <ArrowLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <h1 className="text-base font-medium text-white truncate">
          {tripTitle}
          {stateStartDate && (
            <span className="ml-2 text-sm font-normal text-[#a0a0a0]">
              {new Date(stateStartDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </h1>
        <span className="text-[#707070] text-xs font-mono ml-auto shrink-0">{decodedRef}</span>
      </div>

      {/* Split layout */}
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        {/* Top pane */}
        <div
          className="flex flex-col overflow-hidden bg-[#4a4a4a]"
          style={{ height: `${splitPosition}%` }}
        >
          {/* Tabs */}
          <div className="flex shrink-0 border-b border-[#505050] items-center">
            {["Details", "Summary"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "text-[#ff7c46] border-b-2 border-[#ff7c46]"
                    : "text-[#a0a0a0] hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === "Details" && (
              <div className="rounded-lg bg-[#3d3d3d] p-4 text-[#c0c0c0] text-sm leading-relaxed whitespace-pre-wrap min-h-full">
                {detailsLoading ? (
                  <span className="text-[#707070] italic">Loading trip details…</span>
                ) : (
                  detailsContent || <span className="text-[#707070] italic">No details available.</span>
                )}
              </div>
            )}
            {activeTab === "Summary" && (
              summaryHtml ? (
                <iframe
                  srcDoc={summaryHtml}
                  className="w-full h-full rounded-lg border border-[#505050]"
                  title="Itinerary Summary"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="rounded-lg bg-[#3d3d3d] p-4 h-full flex items-center justify-center text-[#707070] italic text-sm">
                  {summaryGenerating ? "Generating initial summary…" : "Ask the chatbot to generate an itinerary document — it will appear here."}
                </div>
              )
            )}
          </div>
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
          className="flex h-4 cursor-row-resize items-center justify-center bg-[#505050] hover:bg-[#606060] transition-colors touch-none shrink-0"
        >
          <div className="h-1 w-16 rounded-full bg-[#808080]" />
        </div>

        {/* Bottom pane — chat */}
        <div className="overflow-hidden" style={{ height: `${100 - splitPosition}%` }}>
          <ChatPanel
            initialSystemContext={`You are managing the Vamoos trip with reference code: ${decodedRef}. Always use this reference code when calling tools.`}
            onHtmlGenerated={(html) => setSummaryHtml(html)}
            onTripMutated={handleTripMutated}
            onPersonAdded={handlePersonAdded}
          />
        </div>
      </div>
    </div>
  );
}
