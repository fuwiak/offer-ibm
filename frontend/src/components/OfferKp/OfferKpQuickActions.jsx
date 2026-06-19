import { useTranslation } from "react-i18next";
import {
  Briefcase,
  ChartBar,
  ChartLineUp,
  ChatCircle,
  Coins,
  FileText,
  MagnifyingGlass,
  Question,
  Receipt,
  Scales,
  UsersThree,
} from "@phosphor-icons/react";

const ACTIONS = [
  { key: "generalAnalysis", icon: Scales },
  { key: "dashboard", icon: ChartBar },
  { key: "track", icon: MagnifyingGlass },
  { key: "salesReport", icon: ChartLineUp },
  { key: "sendMessage", icon: ChatCircle },
  { key: "quote", icon: FileText },
  { key: "commission", icon: Briefcase },
  { key: "unpaidInvoices", icon: Receipt },
  { key: "ordersThisMonth", icon: Coins },
  { key: "partnerReport", icon: UsersThree },
  { key: "sav", icon: Scales },
  { key: "technical", icon: Question },
];

/**
 * Carbon-style quick action grid for OfferKP home / empty chat.
 */
export default function OfferKpQuickActions({ onAction }) {
  const { t } = useTranslation("offerKp");

  return (
    <section className="offerKp-quick-grid" aria-label="Quick actions">
      {ACTIONS.map(({ key, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className="offerKp-quick-card"
          onClick={() => onAction?.(key)}
        >
          <Icon size={24} weight="light" className="offerKp-quick-card__icon" />
          <span className="offerKp-quick-card__label">
            {t(`home.quickActions.${key}`)}
          </span>
        </button>
      ))}
    </section>
  );
}
