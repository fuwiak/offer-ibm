/**
 * Catalog title identity key.
 * Collapses whitespace AND thread forms so OCR/parseInquiry `M6x20`
 * matches ShopDB `M  6x 20` (same product, different spacing).
 */
function catalogNameKey(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[×х]/gu, "x")
    .replace(/\s+/g, " ")
    .replace(
      /(^|[^a-zа-яё0-9])[mм]\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/giu,
      (_, pre, diameter, length) =>
        `${pre}m${String(diameter).replace(",", ".")}x${String(length).replace(",", ".")}`
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** MySQL expression that mirrors catalogNameKey for literal title lookup. */
function catalogNameSqlExpr(columnSql) {
  return `LOWER(TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(${columnSql}, '[[:space:]]+', ' '),
      '[mмMМ][[:space:]]*([0-9]+([.,][0-9]+)?)[[:space:]]*[x×хXХ][[:space:]]*([0-9]+([.,][0-9]+)?)',
      'm$1x$3'
    ),
    '[[:space:]]+',
    ' '
  )))`;
}

module.exports = {
  catalogNameKey,
  catalogNameSqlExpr,
};
