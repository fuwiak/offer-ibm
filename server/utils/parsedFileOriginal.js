const fs = require("fs");
const path = require("path");
const { v4 } = require("uuid");
const {
  directUploadsPath,
  hotdirPath,
  normalizePath,
  isWithin,
  sanitizeFileName,
} = require("./files");

function isPdfFilename(name = "") {
  return /\.pdf$/i.test(String(name || "").trim());
}

/**
 * Копирует загруженный PDF из hotdir до парсинга (collector удаляет исходник).
 * @param {string} originalname
 * @returns {string|null} относительный путь вроде originals/<uuid>-<name>.pdf
 */
function archiveUploadedPdfOriginal(originalname = "") {
  const safeName = sanitizeFileName(normalizePath(String(originalname || "")));
  if (!isPdfFilename(safeName)) return null;

  const sourcePath = path.resolve(hotdirPath, safeName);
  if (
    !fs.existsSync(sourcePath) ||
    !isWithin(path.resolve(hotdirPath), sourcePath)
  ) {
    return null;
  }

  const originalsDir = path.resolve(directUploadsPath, "originals");
  if (!fs.existsSync(originalsDir)) {
    fs.mkdirSync(originalsDir, { recursive: true });
  }

  const storedName = `${v4()}-${safeName}`;
  const destinationPath = path.resolve(originalsDir, storedName);
  if (!isWithin(originalsDir, destinationPath)) return null;

  fs.copyFileSync(sourcePath, destinationPath);
  return `originals/${storedName}`;
}

/**
 * @param {string} originalLocation
 * @returns {string|null}
 */
function resolveOriginalFilePath(originalLocation = "") {
  const relative = String(originalLocation || "").trim();
  if (!relative || relative.includes("..")) return null;

  const filePath = path.resolve(directUploadsPath, relative);
  if (
    !fs.existsSync(filePath) ||
    !isWithin(path.resolve(directUploadsPath), filePath)
  ) {
    return null;
  }
  return filePath;
}

module.exports = {
  isPdfFilename,
  archiveUploadedPdfOriginal,
  resolveOriginalFilePath,
};
