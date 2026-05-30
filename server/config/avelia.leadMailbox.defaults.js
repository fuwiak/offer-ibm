/**
 * IONOS webmail for lead-transfer@alliaverre.fr
 * https://id.ionos.com/identifier?client_app=IONOSMAIL
 *
 * Railway env:
 *   MAIL=lead-transfer@alliaverre.fr
 *   MAIL_PASSWORD=<mailbox password>
 *
 * Optional overrides:
 *   MAIL_IMAP_HOST (optional; .fr mailboxes default imap.ionos.fr)
 *   MAIL_IMAP_PORT (default 993)
 *   LEAD_MAILBOX_POLL_INTERVAL_MS (default 1200000 = 20 min)
 *   LEAD_MAILBOX_SYNC_BATCH_SIZE (default 10 — last N messages per sync)
 *   LEAD_MAILBOX_DISPLAY_LIMIT (default 10 — shown in Leads inbox)
 */
module.exports = {
  DEFAULT_LEAD_MAILBOX: "lead-transfer@alliaverre.fr",
  IONOS_IMAP_HOST: "imap.ionos.com",
  /** French IONOS domains (e.g. @alliaverre.fr) */
  IONOS_IMAP_HOST_FR: "imap.ionos.fr",
  IONOS_IMAP_PORT: 993,
  IONOS_WEBMAIL_LOGIN_URL:
    "https://id.ionos.com/identifier?client_app=IONOSMAIL",
  DEFAULT_POLL_INTERVAL_MS: 20 * 60 * 1000,
  DEFAULT_SYNC_BATCH_SIZE: 10,
  DEFAULT_DISPLAY_LIMIT: 10,
};
