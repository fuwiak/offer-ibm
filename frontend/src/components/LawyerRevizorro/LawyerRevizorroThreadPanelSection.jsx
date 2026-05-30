import { useEffect, useState } from "react";
import { PencilSimple, Lock } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export default function LawyerRevizorroThreadPanelSection({
  title,
  value,
  onSave,
  placeholder,
  rows = 5,
  showPrivateBadge = false,
}) {
  const { t } = useTranslation("lawyerRevizorro");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function handleSave() {
    onSave(draft);
    setEditing(false);
  }

  return (
    <section className="lawyerRevizorro-thread-panel-section">
      <div className="lawyerRevizorro-thread-panel-section__head">
        <h3 className="lawyerRevizorro-thread-panel-section__title">{title}</h3>
        {!editing ? (
          <button
            type="button"
            className="lawyerRevizorro-thread-panel-section__edit"
            onClick={() => setEditing(true)}
            aria-label={t("layout.editSection", { section: title })}
          >
            <PencilSimple size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="lawyerRevizorro-thread-panel-section__save"
            onClick={handleSave}
          >
            {t("layout.save")}
          </button>
        )}
      </div>
      {showPrivateBadge && (
        <p className="lawyerRevizorro-thread-panel-section__badge">
          <Lock size={12} weight="fill" aria-hidden />
          {t("layout.onlyYou")}
        </p>
      )}
      {editing ? (
        <textarea
          className="lawyerRevizorro-thread-panel-section__textarea"
          rows={rows}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <p className="lawyerRevizorro-thread-panel-section__body">
          {value?.trim() ? value : placeholder}
        </p>
      )}
    </section>
  );
}
