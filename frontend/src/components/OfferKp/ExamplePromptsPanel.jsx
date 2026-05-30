import { useTranslation } from "react-i18next";
import { Lightbulb, Question } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import { PROMPT_INPUT_EVENT, PROMPT_INPUT_ID } from "@/components/WorkspaceChat/ChatContainer/PromptInput";
import { EXAMPLE_PROMPT_KEYS } from "@/utils/offerKp/examplePrompts";

export default function ExamplePromptsPanel() {
  const { t } = useTranslation("offerKp");

  function insertPrompt(text) {
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent: text, writeMode: "replace" },
      })
    );
    document.getElementById(PROMPT_INPUT_ID)?.focus();
  }

  return (
    <div className="offerKp-example-prompts">
      <div className="offerKp-info-banner--blue offerKp-example-prompts__banner">
        <Lightbulb size={20} className="shrink-0 text-primary-button" weight="duotone" />
        <div className="flex-1 min-w-0">
          <div className="offerKp-example-prompts__banner-head">
            <h3 className="offerKp-example-prompts__title">
              {t("home.examplePrompts.title")}
            </h3>
            <button
              type="button"
              className="offerKp-example-prompts__help"
              aria-label={t("home.examplePrompts.hint")}
              data-tooltip-id="offerKp-example-prompts-help"
              data-tooltip-content={t("home.examplePrompts.hint")}
            >
              <Question size={16} weight="bold" />
            </button>
          </div>
          <p className="offerKp-example-prompts__lead">
            {t("home.examplePrompts.lead")}
          </p>
        </div>
      </div>

      <ul className="offerKp-example-prompts__list">
        {EXAMPLE_PROMPT_KEYS.map((key) => {
          const text = t(`home.examplePrompts.items.${key}`);
          return (
            <li key={key}>
              <button
                type="button"
                className="offerKp-example-prompts__item"
                onClick={() => insertPrompt(text)}
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>

      <Tooltip
        id="offerKp-example-prompts-help"
        place="left"
        delayShow={200}
        className="tooltip !text-xs max-w-[280px] z-[100]"
      />
    </div>
  );
}
