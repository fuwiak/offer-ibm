import { downloadQuoteFileBlob } from "@/utils/offerKp/quoteFileDownload";

const StorageFiles = {
  /**
   * Download a generated file — routes quote PDF/DOCX via offerKp API (elia pattern + auth).
   */
  download: async function (storageFilename, displayFilename = "") {
    try {
      return await downloadQuoteFileBlob({
        storageFilename,
        filename: displayFilename || storageFilename,
      });
    } catch (e) {
      console.error(
        "[StorageFiles] Download failed:",
        storageFilename,
        e?.message || e
      );
      return null;
    }
  },
};

export default StorageFiles;
