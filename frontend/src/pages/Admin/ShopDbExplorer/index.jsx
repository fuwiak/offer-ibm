import { useEffect, useMemo, useState } from "react";
import OfferKpSuiteLayout from "@/layouts/OfferKpSuiteLayout";
import { useTranslation } from "react-i18next";
import OfferKp from "@/models/offerKp";
import {
  Database,
  Table as TableIcon,
  Play,
  ArrowClockwise,
  Warning,
  Sparkle,
} from "@phosphor-icons/react";

function ResultTable({ columns, rows }) {
  if (!columns?.length) {
    return (
      <p className="text-xs text-theme-text-secondary p-4">No columns.</p>
    );
  }
  return (
    <div className="overflow-auto max-h-[60vh] border-t border-theme-sidebar-border">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-theme-bg-secondary">
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2 font-medium text-theme-text-secondary border-b border-theme-sidebar-border whitespace-nowrap"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-theme-sidebar-border hover:bg-theme-sidebar-item-hover"
            >
              {columns.map((c) => {
                const v = row[c];
                const display =
                  v === null || v === undefined
                    ? "NULL"
                    : typeof v === "object"
                      ? JSON.stringify(v)
                      : String(v);
                return (
                  <td
                    key={c}
                    className={`px-3 py-1.5 align-top max-w-[420px] truncate font-mono ${
                      v === null || v === undefined
                        ? "text-theme-text-secondary italic"
                        : "text-theme-text-primary"
                    }`}
                    title={display}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ShopDbExplorer() {
  const { t } = useTranslation("offerKp");
  const [status, setStatus] = useState(null);
  const [tables, setTables] = useState([]);
  const [activeTable, setActiveTable] = useState(null);
  const [schema, setSchema] = useState([]);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadingTables, setLoadingTables] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState("");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState(null);

  const loadTables = async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const [st, tb] = await Promise.all([
        OfferKp.dbStatus().catch(() => null),
        OfferKp.dbTables(),
      ]);
      setStatus(st);
      setTables(tb.tables || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingTables(false);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  const openTable = async (name) => {
    setActiveTable(name);
    setError(null);
    setRunning(true);
    setSql(`SELECT * FROM \`${name}\` LIMIT 50`);
    try {
      const data = await OfferKp.dbTable(name);
      setSchema(data.columns || []);
      setResult(data.preview || null);
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const runQuery = async () => {
    if (!sql.trim()) return;
    setRunning(true);
    setError(null);
    try {
      const data = await OfferKp.dbQuery(sql, 200);
      setResult(data);
    } catch (e) {
      setError(e.message);
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const askDb = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setError(null);
    setAnswer(null);
    try {
      const data = await OfferKp.dbAsk(question, 50);
      setAnswer(data.answer || "");
      if (data.sql) setSql(data.sql);
      setResult(data.result || null);
      setActiveTable(null);
      setSchema([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setAsking(false);
    }
  };

  const filteredTables = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((tb) => tb.name.toLowerCase().includes(q));
  }, [tables, filter]);

  const target = status?.target;

  return (
    <OfferKpSuiteLayout>
      <div className="flex items-center justify-between mb-2">
        <h1 className="offerKp-suite-page-title flex items-center gap-2">
          <Database size={22} />
          {t("admin.db.title")}
        </h1>
        <button
          type="button"
          onClick={loadTables}
          className="offerKp-nav-item flex items-center gap-2 text-xs"
          title={t("admin.db.refresh")}
        >
          <ArrowClockwise size={14} />
          {t("admin.db.refresh")}
        </button>
      </div>
      <p className="text-sm text-theme-text-secondary mb-4 max-w-2xl">
        {t("admin.db.subtitle")}
      </p>

      {target && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-theme-text-secondary mb-4 font-mono">
          <span>
            host: <b className="text-theme-text-primary">{target.host || "—"}</b>
          </span>
          <span>
            db: <b className="text-theme-text-primary">{target.database || "—"}</b>
          </span>
          <span>
            user: <b className="text-theme-text-primary">{target.user || "—"}</b>
          </span>
          <span>
            ssl:{" "}
            <b className="text-theme-text-primary">
              {target.ssl ? "on" : "off"}
            </b>
          </span>
        </div>
      )}

      {error && (
        <div
          className="flex items-start gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/30 px-3 py-2 mb-4"
          role="alert"
        >
          <Warning size={16} className="mt-0.5 shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Tables list */}
        <div className="bg-theme-bg-primary border border-theme-sidebar-border flex flex-col max-h-[78vh]">
          <div className="px-3 py-2 border-b border-theme-sidebar-border">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("admin.db.filterTables")}
              className="w-full bg-theme-bg-chat-input text-xs px-2 py-1.5 text-theme-text-primary border border-theme-sidebar-border focus:outline-none focus:border-primary-button"
            />
          </div>
          <div className="overflow-auto flex-1">
            {loadingTables ? (
              <p className="text-xs text-theme-text-secondary p-3">
                {t("admin.db.loading")}
              </p>
            ) : filteredTables.length === 0 ? (
              <p className="text-xs text-theme-text-secondary p-3">
                {t("admin.db.noTables")}
              </p>
            ) : (
              <ul>
                {filteredTables.map((tb) => (
                  <li key={tb.name}>
                    <button
                      type="button"
                      onClick={() => openTable(tb.name)}
                      className={`w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 text-xs hover:bg-theme-sidebar-item-hover ${
                        activeTable === tb.name
                          ? "bg-theme-sidebar-item-hover text-primary-button"
                          : "text-theme-text-primary"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <TableIcon size={13} className="shrink-0" />
                        <span className="truncate font-mono">{tb.name}</span>
                      </span>
                      <span className="text-theme-text-secondary shrink-0">
                        {tb.approxRows.toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Query + results */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* Natural-language ask (LLM → SQL → answer) */}
          <div className="bg-theme-bg-primary border border-theme-sidebar-border">
            <div className="flex items-center justify-between px-3 py-2 border-b border-theme-sidebar-border">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-theme-text-secondary">
                <Sparkle size={13} weight="fill" className="text-primary-button" />
                {t("admin.db.askTitle")}
              </span>
              <button
                type="button"
                onClick={askDb}
                disabled={asking || !question.trim()}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-primary-button text-white disabled:opacity-50 hover:opacity-90"
              >
                <Sparkle size={13} weight="fill" />
                {asking ? t("admin.db.asking") : t("admin.db.ask")}
              </button>
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  askDb();
                }
              }}
              rows={2}
              placeholder={t("admin.db.askPlaceholder")}
              className="w-full bg-theme-bg-chat-input text-sm p-3 text-theme-text-primary resize-y focus:outline-none"
            />
            {answer !== null && (
              <div className="px-3 py-2 text-sm text-theme-text-primary border-t border-theme-sidebar-border whitespace-pre-wrap">
                {answer || t("admin.db.noAnswer")}
              </div>
            )}
            <div className="px-3 py-1.5 text-[10px] text-theme-text-secondary border-t border-theme-sidebar-border">
              {t("admin.db.askHint")}
            </div>
          </div>

          <div className="bg-theme-bg-primary border border-theme-sidebar-border">
            <div className="flex items-center justify-between px-3 py-2 border-b border-theme-sidebar-border">
              <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-secondary">
                {t("admin.db.queryEditor")}
              </span>
              <button
                type="button"
                onClick={runQuery}
                disabled={running || !sql.trim()}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded bg-primary-button text-white disabled:opacity-50 hover:opacity-90"
              >
                <Play size={13} weight="fill" />
                {running ? t("admin.db.running") : t("admin.db.run")}
              </button>
            </div>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  runQuery();
                }
              }}
              spellCheck={false}
              rows={5}
              placeholder="SELECT * FROM shop_product WHERE status = 1 LIMIT 50"
              className="w-full bg-theme-bg-chat-input text-xs font-mono p-3 text-theme-text-primary resize-y focus:outline-none"
            />
            <div className="px-3 py-1.5 text-[10px] text-theme-text-secondary border-t border-theme-sidebar-border">
              {t("admin.db.readOnlyHint")}
            </div>
          </div>

          {schema.length > 0 && activeTable && (
            <details className="bg-theme-bg-primary border border-theme-sidebar-border">
              <summary className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-theme-text-secondary cursor-pointer">
                {t("admin.db.schemaOf")} <span className="font-mono">{activeTable}</span> ({schema.length})
              </summary>
              <div className="overflow-auto max-h-[30vh] border-t border-theme-sidebar-border">
                <table className="w-full text-xs">
                  <thead className="bg-theme-bg-secondary">
                    <tr>
                      {["column", "type", "null", "key", "default"].map((h) => (
                        <th
                          key={h}
                          className="text-left px-3 py-1.5 font-medium text-theme-text-secondary"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schema.map((col) => (
                      <tr
                        key={col.name}
                        className="border-t border-theme-sidebar-border"
                      >
                        <td className="px-3 py-1 font-mono text-theme-text-primary">
                          {col.name}
                          {col.key === "PRI" && (
                            <span className="ml-1 text-[9px] text-primary-button">
                              PK
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1 font-mono text-theme-text-secondary">
                          {col.type}
                        </td>
                        <td className="px-3 py-1 text-theme-text-secondary">
                          {col.nullable ? "YES" : "NO"}
                        </td>
                        <td className="px-3 py-1 text-theme-text-secondary">
                          {col.key || ""}
                        </td>
                        <td className="px-3 py-1 font-mono text-theme-text-secondary">
                          {col.default === null ? "" : String(col.default)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="bg-theme-bg-primary border border-theme-sidebar-border">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-theme-text-secondary">
                {t("admin.db.results")}
              </span>
              {result && (
                <span className="text-[11px] text-theme-text-secondary">
                  {result.rowCount} {t("admin.db.rows")} · {result.ms}ms
                  {result.truncated && ` · ${t("admin.db.truncated")}`}
                </span>
              )}
            </div>
            {result ? (
              <ResultTable columns={result.columns} rows={result.rows} />
            ) : (
              <p className="text-xs text-theme-text-secondary p-4">
                {t("admin.db.noResults")}
              </p>
            )}
          </div>
        </div>
      </div>
    </OfferKpSuiteLayout>
  );
}
