import { useState } from "react";
import { OFFER_KP_PRODUCTS } from "@/utils/offerKp/pricing";
import { QUOTE_BRAND } from "@/utils/offerKp/quoteBrand";

/** Упрощённая схема позиции каталога purolat.com (не стекло). */
const CROSS_SECTIONS = {
  "din-975": {
    name: "Штанга DIN 975",
    spec: "D × L · класс прочности · покрытие",
    layers: [
      { label: "Резьба / стержень", fill: "#b8c5d6", stroke: "#5a6a7a", height: 50, y: 0 },
      { label: "Резьбовая зона", fill: "#7ec8e3", stroke: "#3a92b5", height: 20, y: 50 },
    ],
    edgeColor: "#0c7d69",
  },
  "din-931": {
    name: "Болт DIN 931",
    spec: "Головка + стержень + резьба",
    layers: [
      { label: "Головка", fill: "#a8d8f0", stroke: "#5ba3c9", height: 28, y: 0 },
      { label: "Стержень", fill: "#b8c5d6", stroke: "#5a6a7a", height: 42, y: 28 },
    ],
    edgeColor: "#0c7d69",
  },
  "din-934": {
    name: "Гайка DIN 934",
    spec: "Шестигранник · резьба",
    layers: [
      { label: "Корпус гайки", fill: "#d4edda", stroke: "#5cb85c", height: 36, y: 0 },
      { label: "Резьба", fill: "#7ec8e3", stroke: "#3a92b5", height: 18, y: 36 },
    ],
    edgeColor: "#0c7d69",
  },
  "din-912": {
    name: "Винт DIN 912",
    spec: "Цилиндрическая головка · внутр. шестигранник",
    layers: [
      { label: "Головка", fill: "#a8d8f0", stroke: "#5ba3c9", height: 24, y: 0 },
      { label: "Стержень", fill: "#b8c5d6", stroke: "#5a6a7a", height: 46, y: 24 },
    ],
    edgeColor: "#0c7d69",
  },
  "gost-8787": {
    name: "Сталь шпоночная ГОСТ 8787-68",
    spec: "Профиль шпонки",
    layers: [
      { label: "Сечение шпонки", fill: "#f9e79f", stroke: "#d4ac0d", height: 40, y: 0 },
      { label: "Стандартный профиль", fill: "#e8f4fd", stroke: "#b8d4ea", height: 30, y: 40 },
    ],
    edgeColor: "#0c7d69",
  },
};

const PRODUCT_IDS = OFFER_KP_PRODUCTS.map((p) => p.id);
const DEFAULT_ID = PRODUCT_IDS[0] || "din-975";

export default function CrossSectionViewer() {
  const [activeId, setActiveId] = useState(DEFAULT_ID);
  const section = CROSS_SECTIONS[activeId] ?? CROSS_SECTIONS[DEFAULT_ID];
  const svgHeight = (section.layers.at(-1)?.y ?? 0) + (section.layers.at(-1)?.height ?? 0) + 4;

  return (
    <div className="flex flex-col gap-3 text-xs">
      <p className="text-[10px] text-theme-text-secondary">
        Схема позиции · {QUOTE_BRAND.catalogLabel}
      </p>
      <div className="flex flex-wrap gap-1">
        {OFFER_KP_PRODUCTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveId(p.id)}
            className={`px-2 py-1 text-[10px] border transition-colors ${
              activeId === p.id
                ? "border-[#0c7d69] bg-[#0c7d69]/10 text-[#0c7d69]"
                : "border-theme-sidebar-border text-theme-text-secondary hover:bg-theme-sidebar-item-hover"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="border border-theme-sidebar-border p-3 bg-theme-bg-secondary">
        <div className="flex justify-between mb-2">
          <span className="font-medium text-theme-text-primary">{section.name}</span>
          <span className="text-theme-text-secondary">{section.spec}</span>
        </div>
        <svg
          viewBox={`0 0 120 ${svgHeight}`}
          className="w-full max-w-[200px] mx-auto"
          role="img"
          aria-label={`Cross-section ${section.name}`}
        >
          {section.layers.map((layer, i) => (
            <g key={i}>
              <rect
                x={20}
                y={layer.y}
                width={80}
                height={layer.height}
                fill={layer.fill}
                stroke={layer.stroke}
                strokeWidth={1}
              />
            </g>
          ))}
          <rect
            x={18}
            y={0}
            width={4}
            height={svgHeight}
            fill={section.edgeColor}
            opacity={0.8}
          />
        </svg>
      </div>
    </div>
  );
}
