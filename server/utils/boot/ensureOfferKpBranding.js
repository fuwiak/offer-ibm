const { SystemSettings } = require("../../models/systemSettings");
const {
  DEFAULT_APP_NAME,
  DEFAULT_META_TITLE,
  normalizeAppName,
  normalizeMetaTitle,
} = require("../offerKp/branding");

async function ensureOfferKpBranding() {
  try {
    const customAppName = await SystemSettings.get({
      label: "custom_app_name",
    });
    const metaTitle = await SystemSettings.get({ label: "meta_page_title" });
    const updates = {};

    const nextAppName = normalizeAppName(customAppName?.value);
    if (customAppName?.value !== nextAppName) {
      updates.custom_app_name = nextAppName;
    } else if (!customAppName?.value) {
      updates.custom_app_name = DEFAULT_APP_NAME;
    }

    const nextMetaTitle = normalizeMetaTitle(metaTitle?.value);
    if (metaTitle?.value !== nextMetaTitle) {
      updates.meta_page_title = nextMetaTitle;
    } else if (!metaTitle?.value) {
      updates.meta_page_title = DEFAULT_META_TITLE;
    }

    if (Object.keys(updates).length === 0) return;

    await SystemSettings._updateSettings(updates);
    console.log("[BOOT] OfferKP branding applied:", updates);
  } catch (e) {
    console.warn("[BOOT] ensureOfferKpBranding skipped:", e.message);
  }
}

module.exports = { ensureOfferKpBranding };
