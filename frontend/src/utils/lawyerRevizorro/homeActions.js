import { INITIAL_QUOTE_DRAFT } from "@/utils/lawyerRevizorro/quoteFlow";
import paths from "@/utils/paths";

export function openQuoteBuilder(ctx) {
  const {
    setDocumentPanelOpen,
    setDocumentPanelView,
    setActiveDocumentTab,
    setQuoteDraft,
  } = ctx;
  setDocumentPanelOpen(true);
  setDocumentPanelView("builder");
  setActiveDocumentTab("quote");
  setQuoteDraft(INITIAL_QUOTE_DRAFT);
}

/** Dispatched from home quick actions to open the SAV modal. */
export const LAWYER_REVIZORRO_OPEN_SAV_EVENT = "lawyerRevizorro:open-sav";

export const HOME_CHAT_PROMPTS = {
  generalAnalysis:
    "Проведи общий анализ юридической ситуации по имеющимся данным и дай развёрнутые рекомендации.",
  track:
    "Проверь статус текущего дела и сообщи актуальное положение дел, сроки и ближайшие действия.",
  salesReport:
    "Составь отчёт по правовым рискам на основе имеющихся данных и документов.",
  sendMessage:
    "Помоги составить сообщение клиенту по текущему делу — укажи контекст и что нужно сообщить.",
  quote:
    "Подготовь проект правового заключения. Опиши вопрос или ситуацию, по которой нужно заключение.",
  commission:
    "Покажи мою текущую загрузку: активные дела, поручения и распределение задач.",
  unpaidInvoices:
    "Покажи список неоплаченных счетов и задолженностей с указанием сроков.",
  ordersThisMonth:
    "Покажи задачи и поручения за текущий месяц с приоритетами и сроками.",
  partnerReport:
    "Составь отчёт по контрагентам с анализом правовых рисков за последние два месяца.",
  sav: "Помоги подготовить претензию или досудебное требование — опиши ситуацию и нарушенные права.",
  technical:
    "У меня юридический вопрос. Задай его подробно — постараюсь помочь разобраться.",
  leads: "Покажи мои активные обращения и их текущий статус.",
};

/**
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {{ sendCommand?: (opts: { text?: string, autoSubmit?: boolean, writeMode?: string }) => void }} [opts]
 */
export function handleLawyerRevizorroQuickActionKey(
  key,
  { navigate, sendCommand }
) {
  // Keys that navigate to dedicated pages
  const navAction = {
    dashboard: () => navigate(paths.lawyerRevizorro.dashboard()),
    notifications: () => navigate(paths.lawyerRevizorro.notifications()),
  }[key];

  if (navAction) {
    navAction();
    return;
  }

  // All other keys send a prompt into the chat
  const prompt = HOME_CHAT_PROMPTS[key];
  if (prompt) {
    if (sendCommand) {
      sendCommand({ text: prompt, writeMode: "replace", autoSubmit: true });
      return;
    }
    navigate(paths.lawyerRevizorro.chat({ intent: key }));
    return;
  }

  navigate(paths.lawyerRevizorro.home());
}

export function getHomeActionRoute(key) {
  switch (key) {
    case "dashboard":
      return paths.lawyerRevizorro.dashboard();
    case "notifications":
      return paths.lawyerRevizorro.notifications();
    default:
      if (HOME_CHAT_PROMPTS[key]) {
        return paths.lawyerRevizorro.chat({ intent: key });
      }
      return paths.lawyerRevizorro.home();
  }
}
