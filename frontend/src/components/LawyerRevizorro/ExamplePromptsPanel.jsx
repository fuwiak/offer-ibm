import { useTranslation } from "react-i18next";
import { Lightbulb, Question } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import { PROMPT_INPUT_EVENT, PROMPT_INPUT_ID } from "@/components/WorkspaceChat/ChatContainer/PromptInput";
import { EXAMPLE_PROMPT_KEYS } from "@/utils/lawyerRevizorro/examplePrompts";

export default function ExamplePromptsPanel() {
  const { t } = useTranslation("lawyerRevizorro");

  function insertPrompt(text) {
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent: text, writeMode: "replace" },
      })
    );
    document.getElementById(PROMPT_INPUT_ID)?.focus();
  }

  return (
    <div className="lawyerRevizorro-example-prompts">
      <div className="lawyerRevizorro-info-banner--blue lawyerRevizorro-example-prompts__banner">
        <Lightbulb size={20} className="shrink-0 text-primary-button" weight="duotone" />
        <div className="flex-1 min-w-0">
          <div className="lawyerRevizorro-example-prompts__banner-head">
            <h3 className="lawyerRevizorro-example-prompts__title">
              {t("home.examplePrompts.title")}
            </h3>
            <button
              type="button"
              className="lawyerRevizorro-example-prompts__help"
              aria-label={t("home.examplePrompts.hint")}
              data-tooltip-id="lawyerRevizorro-example-prompts-help"
              data-tooltip-content={t("home.examplePrompts.hint")}
            >
              <Question size={16} weight="bold" />
            </button>
          </div>
          <p className="lawyerRevizorro-example-prompts__lead">
            {t("home.examplePrompts.lead")}
          </p>
        </div>
      </div>

      <ul className="lawyerRevizorro-example-prompts__list">
        {EXAMPLE_PROMPT_KEYS.map((key) => {
          const text = t(`home.examplePrompts.items.${key}`);
          return (
            <li key={key}>
              <button
                type="button"
                className="lawyerRevizorro-example-prompts__item"
                onClick={() => insertPrompt(text)}
              >
                {text}
              </button>
            </li>
          );
        })}
      </ul>

      <Tooltip
        id="lawyerRevizorro-example-prompts-help"
        place="left"
        delayShow={200}
        className="tooltip !text-xs max-w-[280px] z-[100]"
      />
    </div>
  );
}
