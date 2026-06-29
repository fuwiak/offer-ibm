const createFilesLib = require("../agents/aibitat/plugins/create-files/lib");
const {
  getTheme,
  getMargins,
  loadLibraries,
  htmlToDocxElements,
  DEFAULT_NUMBERING_CONFIG,
} = require("../agents/aibitat/plugins/create-files/docx/utils");

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
async function generateDocxFromMarkdown({
  markdown = "",
  filename = "document.docx",
}) {
  const libs = await loadLibraries();
  const { marked, docx } = libs;
  const { Document, Packer, Paragraph, TextRun } = docx;

  marked.setOptions({ gfm: true, breaks: true });
  const theme = getTheme("neutral");
  const margins = getMargins("normal");

  const html = marked.parse(markdown || "");
  const docElements = await htmlToDocxElements(html, libs, () => {}, theme);
  if (docElements.length === 0) {
    docElements.push(
      new Paragraph({ children: [new TextRun({ text: markdown })] })
    );
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
  const displayFilename = /\.docx$/i.test(filename)
    ? filename
    : `${filename}.docx`;

  const saved = await createFilesLib.saveGeneratedFile({
    fileType: "doc",
    extension: "docx",
    buffer,
    displayFilename,
  });

  return {
    filename: saved.displayFilename,
    storageFilename: saved.filename,
    filePath: saved.storagePath,
    fileSize: saved.fileSize,
  };
}

module.exports = { generateDocxFromMarkdown };
