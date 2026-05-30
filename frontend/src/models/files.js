import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";

const StorageFiles = {
  /**
   * Download a file from the server
   * @param {string} filename - The filename to download
   * @returns {Promise<Blob|null>}
   */
  download: async function (storageFilename) {
    const url = `${API_BASE}/agent-skills/generated-files/${encodeURIComponent(storageFilename)}`;
    try {
      const res = await fetch(url, { headers: baseHeaders() });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error(
          `[StorageFiles] Download ${res.status} for ${storageFilename}:`,
          detail.slice(0, 200)
        );
        throw new Error(`Failed to download file (${res.status})`);
      }
      return await res.blob();
    } catch (e) {
      console.error("[StorageFiles] Download failed:", storageFilename, e?.message || e);
      return null;
    }
  },
};

export default StorageFiles;
