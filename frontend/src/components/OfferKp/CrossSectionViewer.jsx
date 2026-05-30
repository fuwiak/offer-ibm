import { useState } from "react";
import { OFFER_KP_PRODUCTS } from "@/utils/offerKp/pricing";

const CROSS_SECTIONS = {
  "one-8-3": {
    name: "offer-kp One 8.3",
    ug: "0.4 W/m²·K",
    thickness: "8.3 mm",
    layers: [
      { label: "Float glass 4 mm", fill: "#a8d8f0", stroke: "#5ba3c9", height: 40, y: 0 },
      { label: "Vacuum (0.3 mm) + micro-spacers", fill: "none", stroke: "#e0e0e0", height: 10, y: 40, dashed: true, isVacuum: true },
      { label: "Float glass 4 mm", fill: "#a8d8f0", stroke: "#5ba3c9", height: 40, y: 50 },
    ],
    edgeColor: "#c0392b",
  },
  "diamond": {
    name: "offer-kp Diamond",
    ug: "0.3 W/m²·K",
    thickness: "10.3 mm",
    layers: [
      { label: "Low-e glass 4 mm", fill: "#7ec8e3", stroke: "#3a92b5", height: 40, y: 0 },
      { label: "Dual low-e coating", fill: "#fff9c4", stroke: "#f9a825", height: 4, y: 40, isCoating: true },
      { label: "Vacuum (0.3 mm) + micro-spacers", fill: "none", stroke: "#e0e0e0", height: 8, y: 44, dashed: true, isVacuum: true },
      { label: "Dual low-e coating", fill: "#fff9c4", stroke: "#f9a825", height: 4, y: 52, isCoating: true },
      { label: "Low-e glass 4 mm", fill: "#7ec8e3", stroke: "#3a92b5", height: 40, y: 56 },
    ],
    edgeColor: "#c0392b",
  },
  "hybrid": {
    name: "offer-kp Hybrid",
    ug: "0.2 W/m²·K",
    thickness: "22 mm",
    layers: [
      { label: "Float glass 4 mm", fill: "#a8d8f0", stroke: "#5ba3c9", height: 36, y: 0 },
      { label: "Argon gap 10 mm", fill: "#e8f4fd", stroke: "#b8d4ea", height: 26, y: 36, isGas: true },
      { label: "Low-e glass 4 mm", fill: "#7ec8e3", stroke: "#3a92b5", height: 36, y: 62 },
      { label: "Vacuum (0.3 mm)", fill: "none", stroke: "#e0e0e0", height: 8, y: 98, dashed: true, isVacuum: true },
      { label: "Float glass 4 mm", fill: "#a8d8f0", stroke: "#5ba3c9", height: 36, y: 106 },
    ],
    edgeColor: "#8e44ad",
  },
  "laminated": {
    name: "offer-kp Laminated",
    ug: "0.4 W/m²·K",
    thickness: "10.8 mm",
    layers: [
      { label: "Float glass 3 mm", fill: "#a8d8f0", stroke: "#5ba3c9", height: 32, y: 0 },
      { label: "PVB interlayer 0.8 mm", fill: "#d4edda", stroke: "#5cb85c", height: 8, y: 32, isInterlayer: true },
      { label: "Float glass 3 mm", fill: "#a8d8f0", stroke: "#5ba3c9", height: 32, y: 40 },
      { label: "Vacuum (0.3 mm) + micro-spacers", fill: "none", stroke: "#e0e0e0", height: 10, y: 72, dashed: true, isVacuum: true },
      { label: "Float glass 4 mm", fill: "#a8d8f0", stroke: "#5ba3c9", height: 40, y: 82 },
    ],
    edgeColor: "#c0392b",
  },
  "cs-6840": {
    name: "offer-kp CS 6840",
    ug: "0.5 W/m²·K",
    thickness: "9.3 mm",
    layers: [
      { label: "Tempered glass 5 mm", fill: "#85c1e9", stroke: "#2980b9", height: 44, y: 0 },
      { label: "Vacuum (0.3 mm) + micro-spacers", fill: "none", stroke: "#e0e0e0", height: 10, y: 44, dashed: true, isVacuum: true },
      { label: "Tempered glass 4 mm", fill: "#85c1e9", stroke: "#2980b9", height: 36, y: 54 },
    ],
    edgeColor: "#e67e22",
  },
};

const PRODUCT_IDS = OFFER_KP_PRODUCTS.map((p) => p.id);

export default function CrossSectionViewer() {
  const [activeId, setActiveId] = useState(PRODUCT_IDS[0]);
  const section = CROSS_SECTIONS[activeId] ?? CROSS_SECTIONS["one-8-3"];
  const svgHeight = (section.layers.at(-1)?.y ?? 0) + (section.layers.at(-1)?.height ?? 0) + 4;

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* Product tabs */}
      <div className="flex flex-wrap gap-1">
        {OFFER_KP_PRODUCTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveId(p.id)}
            className={`px-2 py-1 text-[10px] border ${
              activeId === p.id
                ? "bg-blue-600 text-white border-blue-600"
                : "border-white/20 text-white/60 light:border-slate-300 light:text-slate-500 hover:border-white/40"
            }`}
          >
            {p.name.replace("offer-kp ", "")}
          </button>
        ))}
      </div>

      {/* Product name + specs */}
      <div>
        <p className="font-semibold text-white light:text-slate-900 text-[11px]">
          {section.name}
        </p>
        <div className="flex gap-3 mt-0.5 text-[10px] text-white/60 light:text-slate-500">
          <span>Ug {section.ug}</span>
          <span>·</span>
          <span>{section.thickness}</span>
        </div>
      </div>

      {/* SVG cross-section */}
      <div className="bg-white/5 light:bg-slate-50 border border-white/10 light:border-slate-200 p-3">
        <svg
          viewBox={`0 0 220 ${svgHeight + 8}`}
          width="100%"
          className="overflow-visible"
          aria-label={`Cross-section diagram of ${section.name}`}
        >
          {/* Edge seal left */}
          <rect x="16" y={-2} width="8" height={svgHeight + 4} fill={section.edgeColor} opacity={0.9} />
          {/* Edge seal right */}
          <rect x="196" y={-2} width="8" height={svgHeight + 4} fill={section.edgeColor} opacity={0.9} />

          {section.layers.map((layer, i) => (
            <g key={i}>
              {layer.isVacuum ? (
                <>
                  <rect
                    x="24"
                    y={layer.y + 2}
                    width="172"
                    height={layer.height - 4}
                    fill="#1a1a2e"
                    opacity={0.6}
                  />
                  {Array.from({ length: 12 }).map((_, si) => (
                    <circle
                      key={si}
                      cx={38 + si * 14}
                      cy={layer.y + layer.height / 2}
                      r={1.5}
                      fill="#888"
                      opacity={0.8}
                    />
                  ))}
                  <text
                    x="110"
                    y={layer.y + layer.height / 2 + 4}
                    textAnchor="middle"
                    fontSize="7"
                    fill="#aaa"
                    className="select-none"
                  >
                    VACUUM
                  </text>
                </>
              ) : layer.isGas ? (
                <>
                  <rect
                    x="24"
                    y={layer.y}
                    width="172"
                    height={layer.height}
                    fill={layer.fill}
                    stroke={layer.stroke}
                    strokeWidth="0.5"
                    opacity={0.5}
                  />
                  <text
                    x="110"
                    y={layer.y + layer.height / 2 + 4}
                    textAnchor="middle"
                    fontSize="8"
                    fill="#555"
                    className="select-none"
                  >
                    Ar
                  </text>
                </>
              ) : (
                <rect
                  x="24"
                  y={layer.y}
                  width="172"
                  height={layer.height}
                  fill={layer.fill}
                  stroke={layer.stroke}
                  strokeWidth="0.5"
                  opacity={layer.isCoating ? 0.85 : layer.isInterlayer ? 0.9 : 0.75}
                />
              )}
            </g>
          ))}

          {/* Dimension line */}
          <line x1="208" y1="0" x2="208" y2={svgHeight} stroke="#888" strokeWidth="0.5" />
          <line x1="205" y1="0" x2="211" y2="0" stroke="#888" strokeWidth="0.5" />
          <line x1="205" y1={svgHeight} x2="211" y2={svgHeight} stroke="#888" strokeWidth="0.5" />
          <text x="215" y={svgHeight / 2 + 4} fontSize="7" fill="#999" className="select-none">
            {section.thickness}
          </text>
        </svg>
      </div>

      {/* Layer legend */}
      <div className="space-y-1">
        {section.layers.map((layer, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 border shrink-0"
              style={{
                background: layer.isVacuum ? "#1a1a2e" : layer.fill,
                borderColor: layer.stroke ?? "transparent",
                opacity: 0.8,
              }}
            />
            <span className="text-[10px] text-white/70 light:text-slate-600">
              {layer.label}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-1">
          <span
            className="inline-block w-3 h-3 shrink-0"
            style={{ background: section.edgeColor, opacity: 0.9 }}
          />
          <span className="text-[10px] text-white/70 light:text-slate-600">
            Perimeter edge seal
          </span>
        </div>
      </div>
    </div>
  );
}
