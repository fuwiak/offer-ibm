"use strict";

const path = require("path");
const { offerKpLog } = require("../offerKpApp/offerKpLog");

const DEFAULT_MAX_EDGE = Number(process.env.OFFER_KP_VISION_OCR_MAX_EDGE) || 1600;
const DEFAULT_JPEG_QUALITY =
  Number(process.env.OFFER_KP_VISION_OCR_JPEG_QUALITY) || 80;

function loadSharp() {
  try {
    return require("sharp");
  } catch {
    /* optional */
  }
  try {
    return require(path.join(
      __dirname,
      "../../../collector/node_modules/sharp"
    ));
  } catch {
    return null;
  }
}

/**
 * Downscale + JPEG-compress page/photo buffers before VL.
 * Huge scan embeds (e.g. 2448×3456) otherwise dominate transfer + decode time.
 *
 * @param {Buffer} buffer
 * @param {{ maxEdge?: number, quality?: number, mime?: string }} [opts]
 * @returns {Promise<{ buffer: Buffer, mime: string }>}
 */
async function prepareVisionImageBuffer(buffer, opts = {}) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (!input.length) return { buffer: input, mime: opts.mime || "image/png" };

  const maxEdge = Number(opts.maxEdge) || DEFAULT_MAX_EDGE;
  const quality = Number(opts.quality) || DEFAULT_JPEG_QUALITY;
  const sharp = loadSharp();
  if (!sharp) {
    return { buffer: input, mime: opts.mime || "image/png" };
  }

  try {
    const image = sharp(input, { failOn: "none" });
    const meta = await image.metadata();
    const width = Number(meta.width) || 0;
    const height = Number(meta.height) || 0;
    const longEdge = Math.max(width, height);
    let pipeline = image.rotate(); // honor EXIF
    if (longEdge > maxEdge && maxEdge > 0) {
      pipeline = pipeline.resize({
        width: width >= height ? maxEdge : undefined,
        height: height > width ? maxEdge : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    return { buffer: out, mime: "image/jpeg" };
  } catch (error) {
    offerKpLog("warn", "Vision image prep failed — using original buffer", {
      error: error?.message || String(error),
      bytes: input.length,
    });
    return { buffer: input, mime: opts.mime || "image/png" };
  }
}

module.exports = {
  prepareVisionImageBuffer,
  DEFAULT_MAX_EDGE,
  DEFAULT_JPEG_QUALITY,
};
