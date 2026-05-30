const { v4 } = require("uuid");
const { tokenizeString } = require("../../utils/tokenizer");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../utils/files");
const OCRLoader = require("../../utils/OCRLoader");
const { textQualityScore } = require("../../utils/OCRLoader");
const { default: slugify } = require("slugify");
const parseCache = require("../../utils/parseCache");

async function asImage({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  // OCR изображения тоже дорогой — кэшируем текст по отпечатку файла + языкам.
  const cacheKey = parseCache.buildKey(fullFilePath, [
    "image",
    options?.ocr?.langList || "default",
  ]);
  let content = await parseCache.remember(cacheKey, () =>
    new OCRLoader({ targetLanguages: options?.ocr?.langList }).ocrImage(
      fullFilePath
    )
  );

  if (!content?.length) {
    console.error(`Resulting text content was empty for ${filename}.`);
    if (!options.absolutePath) trashFile(fullFilePath);
    return {
      success: false,
      reason: `No text content found in ${filename}.`,
      documents: [],
    };
  }

  const score = textQualityScore(content);
  console.log(
    `-- Working ${filename} (quality score: ${score.toFixed(2)}) --`
  );

  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor: metadata.docAuthor || "Unknown",
    description: metadata.description || "Unknown",
    docSource: metadata.docSource || "image file uploaded by the user.",
    chunkSource: metadata.chunkSource || "",
    published: createdDate(fullFilePath),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content),
  };

  const document = writeToServerDocuments({
    data,
    filename: `${slugify(filename)}-${data.id}`,
    options: { parseOnly: options.parseOnly },
  });
  if (!options.absolutePath) trashFile(fullFilePath);
  console.log(`[SUCCESS]: ${filename} converted & ready for embedding.\n`);
  return { success: true, reason: null, documents: [document] };
}

module.exports = asImage;
