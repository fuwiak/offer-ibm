"use strict";

jest.mock("../../../utils/offerKpApp/offerKpLog", () => ({
  offerKpLog: jest.fn(),
}));
jest.mock("../../../utils/offerKpApp/lmStudioModels", () => ({
  loadLmStudioModelForTask: jest.fn(),
}));
jest.mock("../../../config/offerKp.models", () => ({
  resolveOfferKpOcrModel: () => "mock-model",
}));

const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("child_process", () => ({
  execFile: jest.fn(),
}));

const { execFile } = require("child_process");
const { renderPdfPages } = require("../../../utils/offerKp/offerKpPaddleOcr");

describe("renderPdfPages", () => {
  const prevJpeg = process.env.OFFER_KP_VISION_OCR_PDF_JPEG;

  beforeEach(() => {
    process.env.OFFER_KP_VISION_OCR_PDF_JPEG = "1";
    execFile.mockReset();
  });

  afterAll(() => {
    if (prevJpeg === undefined) delete process.env.OFFER_KP_VISION_OCR_PDF_JPEG;
    else process.env.OFFER_KP_VISION_OCR_PDF_JPEG = prevJpeg;
  });

  function mockPdftoppm(writer) {
    execFile.mockImplementation((cmd, args, opts, cb) => {
      const done = typeof opts === "function" ? opts : cb;
      try {
        writer(args);
        done(null, "", "");
      } catch (err) {
        done(err);
      }
    });
  }

  it("accepts .jpeg from pdftoppm -jpeg", async () => {
    mockPdftoppm((args) => {
      expect(args[0]).toBe("-jpeg");
      const outRoot = args[args.length - 1];
      fs.writeFileSync(
        path.join(path.dirname(outRoot), "page-1.jpeg"),
        Buffer.from("fakejpeg")
      );
    });

    const pages = await renderPdfPages("/tmp/fake.pdf", { dpi: 72 });
    expect(pages).toHaveLength(1);
    expect(pages[0].mime).toBe("image/jpeg");
    expect(pages[0].pageNumber).toBe(1);
  });

  it("falls back to png when jpeg yields no pages", async () => {
    const formats = [];
    mockPdftoppm((args) => {
      formats.push(args[0]);
      const outRoot = args[args.length - 1];
      const dir = path.dirname(outRoot);
      if (args[0] === "-jpeg") {
        fs.writeFileSync(path.join(dir, "page-1.ppm"), Buffer.from("x"));
        return;
      }
      fs.writeFileSync(path.join(dir, "page-1.png"), Buffer.from("fakepng"));
    });

    const pages = await renderPdfPages("/tmp/fake.pdf", { dpi: 72 });
    expect(formats).toEqual(["-jpeg", "-png"]);
    expect(pages).toHaveLength(1);
    expect(pages[0].mime).toBe("image/png");
  });

  it("falls back to png when jpeg pdftoppm throws", async () => {
    let call = 0;
    execFile.mockImplementation((cmd, args, opts, cb) => {
      const done = typeof opts === "function" ? opts : cb;
      call += 1;
      if (args[0] === "-jpeg") {
        done(new Error("pdftoppm jpeg unsupported"));
        return;
      }
      const outRoot = args[args.length - 1];
      fs.writeFileSync(
        path.join(path.dirname(outRoot), "page-1.png"),
        Buffer.from("fakepng")
      );
      done(null, "", "");
    });

    const pages = await renderPdfPages("/tmp/fake.pdf", { dpi: 72 });
    expect(call).toBe(2);
    expect(pages).toHaveLength(1);
    expect(pages[0].mime).toBe("image/png");
  });
});
