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

function isImageFilename(name = "") {
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(String(name || "").trim());
}

function isVisionOcrFilename(name = "") {
  return isPdfFilename(name) || isImageFilename(name);
}

function imageMimeFromFilename(name = "") {
  const n = String(name || "").toLowerCase();
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (/\.webp$/.test(n)) return "image/webp";
  if (/\.gif$/.test(n)) return "image/gif";
  if (/\.bmp$/.test(n)) return "image/bmp";
  if (/\.tiff?$/.test(n)) return "image/tiff";
  return "image/png";
}

/**
 * Copy uploaded PDF/image from hotdir before collector trashes the source.
 * @param {string} originalname
 * @returns {string|null} relative path like originals/<uuid>-<name>.pdf
 */
function archiveUploadedOriginal(originalname = "") {
  const safeName = sanitizeFileName(normalizePath(String(originalname || "")));
  if (!isVisionOcrFilename(safeName)) return null;

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

/** @deprecated alias — also archives images now */
function archiveUploadedPdfOriginal(originalname = "") {
  return archiveUploadedOriginal(originalname);
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
  isImageFilename,
  isVisionOcrFilename,
  imageMimeFromFilename,
  archiveUploadedOriginal,
  archiveUploadedPdfOriginal,
  resolveOriginalFilePath,
};
