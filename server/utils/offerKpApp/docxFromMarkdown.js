const path = require("path");
const fs = require("fs/promises");
const { v4: uuidv4 } = require("uuid");
const {
  getTheme,
  getMargins,
  loadLibraries,
  htmlToDocxElements,
  DEFAULT_NUMBERING_CONFIG,
} = require("../agents/aibitat/plugins/create-files/docx/utils");

function storageDir() {
  return path.join(
    process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage"),
    "generated-files"
  );
}

/**
 * Generate a clean Word (.docx) document straight from markdown so the file the
 * user downloads matches exactly what is shown in the side preview (no cover
 * page, neutral theme — same content as the rendered markdown artifact).
 *
 * @param {object} opts
 * @param {string} opts.markdown
 * @param {string} [opts.filename]
 * @returns {Promise<{filename, storageFilename, filePath, fileSize}>}
 */
async function generateDocxFromMarkdown({ markdown = "", filename = "document.docx" }) {
  const libs = await loadLibraries();
  const { marked, docx } = libs;
  const { Document, Packer, Paragraph, TextRun } = docx;

  marked.setOptions({ gfm: true, breaks: true });
  const theme = getTheme("neutral");
  const margins = getMargins("normal");

  const html = marked.parse(markdown || "");
  const docElements = await htmlToDocxElements(html, libs, () => {}, theme);
  if (docElements.length === 0) {
    docElements.push(new Paragraph({ children: [new TextRun({ text: markdown })] }));
  }

  const doc = new Document({
    numbering: DEFAULT_NUMBERING_CONFIG,
    sections: [
      {
        properties: { page: { margin: margins } },
        children: docElements,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  const outDir = storageDir();
  await fs.mkdir(outDir, { recursive: true });

  const displayFilename = /\.docx$/i.test(filename) ? filename : `${filename}.docx`;
  const storageFilename = `doc-${uuidv4().slice(0, 8)}.docx`;
  const filePath = path.join(outDir, storageFilename);
  await fs.writeFile(filePath, buffer);

  return {
    filename: displayFilename,
    storageFilename,
    filePath,
    fileSize: buffer.length,
  };
}

module.exports = { generateDocxFromMarkdown };
