/**
 * Парсинг .eml (RFC 822) — извлечение текста письма для заявки.
 */
const fs = require("fs");

function decodeQuotedPrintable(str) {
  return String(str || "")
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHeadersAndBody(raw) {
  const splitAt = raw.search(/\r?\n\r?\n/);
  if (splitAt === -1) return { headers: {}, body: raw };
  const headerBlock = raw.slice(0, splitAt);
  const body = raw.slice(splitAt).replace(/^\r?\n/, "");
  const headers = {};
  let currentKey = null;
  for (const line of headerBlock.split(/\r?\n/)) {
    if (/^\s/.test(line) && currentKey) {
      headers[currentKey] += " " + line.trim();
    } else {
      const idx = line.indexOf(":");
      if (idx > 0) {
        currentKey = line.slice(0, idx).trim().toLowerCase();
        headers[currentKey] = line.slice(idx + 1).trim();
      }
    }
  }
  return { headers, body };
}

function extractPart(text, boundary, contentType) {
  const re = new RegExp(
    `--${boundary}[\\s\\S]*?Content-Type:\\s*${contentType}[\\s\\S]*?\\r?\\n\\r?\\n([\\s\\S]*?)(?=\\r?\\n--${boundary}|$)`,
    "i"
  );
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

function parseEmlContent(raw) {
  const { headers, body } = parseHeadersAndBody(raw);
  const subject = headers.subject || "";
  const from = headers.from || "";
  let text = "";

  const ct = headers["content-type"] || "text/plain";
  const boundaryMatch = ct.match(/boundary="?([^";\s]+)"?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const plain = extractPart(body, boundary, "text/plain");
    const html = extractPart(body, boundary, "text/html");
    text = plain || stripHtml(html);
    const encoding = ct.includes("quoted-printable") ? "qp" : "raw";
    if (encoding === "qp") text = decodeQuotedPrintable(text);
  } else if (ct.includes("text/html")) {
    text = stripHtml(body);
  } else {
    text = ct.includes("quoted-printable")
      ? decodeQuotedPrintable(body)
      : body;
  }

  const parts = [];
  if (subject) parts.push(`Тема: ${subject}`);
  if (from) parts.push(`От: ${from}`);
  if (text) parts.push("", text);

  return parts.join("\n").trim();
}

async function asEml({ fullFilePath }) {
  const raw = fs.readFileSync(fullFilePath, "utf8");
  const content = parseEmlContent(raw);
  return {
    success: true,
    reason: "",
    documents: [
      {
        id: fullFilePath,
        url: fullFilePath,
        title: fullFilePath.split("/").pop(),
        docAuthor: "eml",
        description: "Email message",
        docSource: fullFilePath,
        chunkSource: fullFilePath,
        published: new Date().toISOString(),
        wordCount: content.split(/\s+/).filter(Boolean).length,
        pageContent: content,
        token_count_estimate: Math.ceil(content.length / 4),
      },
    ],
  };
}

module.exports = { asEml, parseEmlContent };
