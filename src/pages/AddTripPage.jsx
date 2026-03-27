import React, { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

export default function AddTripPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("Details");
  const [splitPosition, setSplitPosition] = useState(45);
  const [detailsContent, setDetailsContent] = useState("");
  const [summaryHtml, setSummaryHtml] = useState("");
  const [refCode, setRefCode] = useState("");

  const containerRef = useRef(null);
  const isDragging = useRef(false);

  // Called by ChatPanel when create_itinerary completes and we get a ref code
  const handleRefCodeKnown = useCallback((code) => {
    setRefCode(code);
    // Immediately load the new trip's details
    callMcpTool("get_itinerary", { reference_code: code })
      .then((result) => setDetailsContent(result))
      .catch(() => {});
  }, []);

  // Called after any MCP tool that mutates the trip
  const handleTripMutated = useCallback(
    (toolName) => {
      if (!refCode) return;
      const mutatingTools = [
        "create_itinerary", "update_itinerary",
        "add_flight_to_itinerary", "add_person_to_itinerary",
        "add_location_to_itinerary", "add_poi_and_attach_to_itinerary",
        "upload_background_image", "upload_document", "upload_gpx_and_attach_to_itinerary",
      ];
      if (mutatingTools.includes(toolName)) {
        callMcpTool("get_itinerary", { reference_code: refCode })
          .then((result) => setDetailsContent(result))
          .catch(() => {});
      }
    },
    [refCode]
  );

  // Drag handlers
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
        <button onClick={() => navigate("/home")} className="text-white hover:text-[#f57c00] transition-colors">
          <ArrowLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <h1 className="text-base font-medium text-white">New Trip</h1>
        {refCode && (
          <span className="text-[#707070] text-xs font-mono ml-auto shrink-0">{refCode}</span>
        )}
      </div>

      {/* Split layout */}
      <div ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
        {/* Top pane */}
        <div
          className="flex flex-col overflow-hidden bg-[#4a4a4a]"
          style={{ height: `${splitPosition}%` }}
        >
          {/* Tabs */}
          <div className="flex shrink-0 border-b border-[#505050]">
            {["Details", "Summary"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? "text-[#f57c00] border-b-2 border-[#f57c00]"
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
                {detailsContent ? (
                  detailsContent
                ) : (
                  <span className="text-[#707070] italic">
                    Chat below to build your trip — details will appear here as the chatbot creates it.
                  </span>
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
                  Ask the chatbot to generate an itinerary document — it will appear here.
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
            initialSystemContext="You are helping the user create a new Vamoos trip. Ask for the trip title, reference code, and dates to get started, then use create_itinerary to create it."
            onHtmlGenerated={(html) => { setSummaryHtml(html); setActiveTab("Summary"); }}
            onTripMutated={handleTripMutated}
            onRefCodeKnown={handleRefCodeKnown}
          />
        </div>
      </div>
    </div>
  );
}
