/**
 * Golden RAG catalog self-match oracle for isolated graphify audits.
 * Source CSV: Rag_catalog_selfmatch_100.expected.csv
 * Seed: offerkp-rag-2026 · Renew: scripts/renew-golden-from-rag.cjs
 * Compare: node graphify-audits/golden-rag-selfmatch-100/compare-vs-golden.cjs
 */
"use strict";

const path = require("path");

const GOLDEN_META = Object.freeze({
  id: "golden-rag-selfmatch-100",
  seed: "offerkp-rag-2026",
  sampleSize: 100,
  sourceCsv: "Rag_catalog_selfmatch_100.expected.csv",
  catalogSource: "server/storage/shopdb-index/canonical-products.json",
  matchType: "exact",
  purpose: "catalog_self_match_oracle",
  compareScript: "compare-vs-golden.cjs",
  renewScript: "scripts/renew-golden-from-rag.cjs",
});

/** @type {ReadonlyArray<{nr:number,sourceName:string,unit:string,quantity:number,matchedSku:string,matchedName:string,matchType:string}>} */
const GOLDEN_ROWS = Object.freeze([
  {
    "nr": 1,
    "sourceName": "Кольцо DIN  471 d 68  / ГОСТ 13942-86 (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "004710000680000",
    "matchedName": "Кольцо DIN  471 d 68  / ГОСТ 13942-86 (10)",
    "matchType": "exact"
  },
  {
    "nr": 2,
    "sourceName": "Штифт DIN  7978 16x 50 / ГОСТ 9464-79 исп. 1  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "079780010160050",
    "matchedName": "Штифт DIN  7978 16x 50 / ГОСТ 9464-79 исп. 1  (5)",
    "matchType": "exact"
  },
  {
    "nr": 3,
    "sourceName": "Заклепка ГОСТ 10300-80   8x 16 сталь (St) / ~ DIN  661  (200)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006610000080016",
    "matchedName": "Заклепка ГОСТ 10300-80   8x 16 сталь (St) / ~ DIN  661  (200)",
    "matchType": "exact"
  },
  {
    "nr": 4,
    "sourceName": "Винт DIN  912 M 24 x2x 60 12.9 П/Р / ГОСТ 11738-84  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009122100242060",
    "matchedName": "Винт DIN  912 M 24 x2x 60 12.9 П/Р / ГОСТ 11738-84  (5)",
    "matchType": "exact"
  },
  {
    "nr": 5,
    "sourceName": "Болт DIN  931 M  8x 50  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009318100080050",
    "matchedName": "Болт DIN  931 M  8x 50  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (100)",
    "matchType": "exact"
  },
  {
    "nr": 6,
    "sourceName": "Анкерный болт с крюком 12x 70 M10 оцинк  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "011154100120070",
    "matchedName": "Анкерный болт с крюком 12x 70 M10 оцинк  (25)",
    "matchType": "exact"
  },
  {
    "nr": 7,
    "sourceName": "Болт DIN  444 B M 10x 45 оцинк П/Р / ~ ГОСТ 3033-79  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "004444140100045",
    "matchedName": "Болт DIN  444 B M 10x 45 оцинк П/Р / ~ ГОСТ 3033-79  (10)",
    "matchType": "exact"
  },
  {
    "nr": 8,
    "sourceName": "Болт DIN  961 M 14x1,5x 35 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009611100140035",
    "matchedName": "Болт DIN  961 M 14x1,5x 35 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (25)",
    "matchType": "exact"
  },
  {
    "nr": 9,
    "sourceName": "Болт DIN  933 M 30x 75 12.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009332000300075",
    "matchedName": "Болт DIN  933 M 30x 75 12.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "matchType": "exact"
  },
  {
    "nr": 10,
    "sourceName": "Гайка DIN  981 KM24 (M120x2)  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009810000240000",
    "matchedName": "Гайка DIN  981 KM24 (M120x2)  (1)",
    "matchType": "exact"
  },
  {
    "nr": 11,
    "sourceName": "Болт ГОСТ 7796-70 M 16x 50 кл.пр. 10.9 оцинк Н/Р  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "077961100160050",
    "matchedName": "Болт ГОСТ 7796-70 M 16x 50 кл.пр. 10.9 оцинк Н/Р  (25)",
    "matchType": "exact"
  },
  {
    "nr": 12,
    "sourceName": "Болт DIN  607 M  8x 80 оцинк Н/Р / ГОСТ 7801-81  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006075100080080",
    "matchedName": "Болт DIN  607 M  8x 80 оцинк Н/Р / ГОСТ 7801-81  (50)",
    "matchType": "exact"
  },
  {
    "nr": 13,
    "sourceName": "Шплинт DIN 11024 d  4,5 (для отв. 5,0) оцинк Form  E  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "110240120045000",
    "matchedName": "Шплинт DIN 11024 d  4,5 (для отв. 5,0) оцинк Form  E  (100)",
    "matchType": "exact"
  },
  {
    "nr": 14,
    "sourceName": "Болт DIN  933 M  8x 12 латунь (MS) / ГОСТ 7798-70 / ГОСТ 7805-70  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009337000080012",
    "matchedName": "Болт DIN  933 M  8x 12 латунь (MS) / ГОСТ 7798-70 / ГОСТ 7805-70  (50)",
    "matchType": "exact"
  },
  {
    "nr": 15,
    "sourceName": "Винт DIN  963 M  3x 25 оцинк / ~ ГОСТ 17475-80 исп. 1  (1000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009634100030025",
    "matchedName": "Винт DIN  963 M  3x 25 оцинк / ~ ГОСТ 17475-80 исп. 1  (1000)",
    "matchType": "exact"
  },
  {
    "nr": 16,
    "sourceName": "Штифт DIN  1481   2 x 22 / ГОСТ 14229-93 / ISO 8752  (1000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "087520009020022",
    "matchedName": "Штифт DIN  1481   2 x 22 / ГОСТ 14229-93 / ISO 8752  (1000)",
    "matchType": "exact"
  },
  {
    "nr": 17,
    "sourceName": "Винт DIN 7985 M  5x 60 оцинк / ~ ГОСТ 17473-80 исп. 2  (200)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "079854100050060",
    "matchedName": "Винт DIN 7985 M  5x 60 оцинк / ~ ГОСТ 17473-80 исп. 2  (200)",
    "matchType": "exact"
  },
  {
    "nr": 18,
    "sourceName": "Кольцо ГОСТ 13942-86 d 58  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "139420000580000",
    "matchedName": "Кольцо ГОСТ 13942-86 d 58  (10)",
    "matchType": "exact"
  },
  {
    "nr": 19,
    "sourceName": "Винт DIN  912 M 10x 50 12.9 Н/Р / ГОСТ 11738-84  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009121200100050",
    "matchedName": "Винт DIN  912 M 10x 50 12.9 Н/Р / ГОСТ 11738-84  (50)",
    "matchType": "exact"
  },
  {
    "nr": 20,
    "sourceName": "Заклепка ГОСТ 10300-80   4x 14 сталь (St) / ~ DIN  661  (1000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006610000040014",
    "matchedName": "Заклепка ГОСТ 10300-80   4x 14 сталь (St) / ~ DIN  661  (1000)",
    "matchType": "exact"
  },
  {
    "nr": 21,
    "sourceName": "Болт DIN  933 M 14x 70  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009338100140070",
    "matchedName": "Болт DIN  933 M 14x 70  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 22,
    "sourceName": "Штифт DIN  6325 12x 40 / ГОСТ 24296-93  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "063250000120040",
    "matchedName": "Штифт DIN  6325 12x 40 / ГОСТ 24296-93  (10)",
    "matchType": "exact"
  },
  {
    "nr": 23,
    "sourceName": "Болт DIN  931 M 24x260  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009318100240260",
    "matchedName": "Болт DIN  931 M 24x260  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "matchType": "exact"
  },
  {
    "nr": 24,
    "sourceName": "Винт DIN  915 M  4x 35 45H / ГОСТ 11075-93  (200)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009152000040035",
    "matchedName": "Винт DIN  915 M  4x 35 45H / ГОСТ 11075-93  (200)",
    "matchType": "exact"
  },
  {
    "nr": 25,
    "sourceName": "Винт DIN  913 M 10x 18 45H / ГОСТ 11074-93  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009132000100018",
    "matchedName": "Винт DIN  913 M 10x 18 45H / ГОСТ 11074-93  (100)",
    "matchType": "exact"
  },
  {
    "nr": 26,
    "sourceName": "Болт DIN  960 M 12x1,5x110  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009608100121110",
    "matchedName": "Болт DIN  960 M 12x1,5x110  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 27,
    "sourceName": "Болт DIN  933 M 22x 40 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009331100220040",
    "matchedName": "Болт DIN  933 M 22x 40 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 28,
    "sourceName": "Винт DIN  914 M 20x100 45H / ГОСТ 8878-93  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009142000200100",
    "matchedName": "Винт DIN  914 M 20x100 45H / ГОСТ 8878-93  (10)",
    "matchType": "exact"
  },
  {
    "nr": 29,
    "sourceName": "Болт DIN  961 M 10x1,25x 90 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009611000101090",
    "matchedName": "Болт DIN  961 M 10x1,25x 90 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (25)",
    "matchType": "exact"
  },
  {
    "nr": 30,
    "sourceName": "Саморез DIN 7982 6,3x120 C-H оцинк (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "079820140063120",
    "matchedName": "Саморез DIN 7982 6,3x120 C-H оцинк (50)",
    "matchType": "exact"
  },
  {
    "nr": 31,
    "sourceName": "Заклепка ГОСТ 10299-80 12x 30 сталь (St) / ~ DIN  660  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006600000120030",
    "matchedName": "Заклепка ГОСТ 10299-80 12x 30 сталь (St) / ~ DIN  660  (50)",
    "matchType": "exact"
  },
  {
    "nr": 32,
    "sourceName": "Винт DIN  912 M 14x240 10.9 оцинк Н/Р / ГОСТ 11738-84  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009121100140240",
    "matchedName": "Винт DIN  912 M 14x240 10.9 оцинк Н/Р / ГОСТ 11738-84  (5)",
    "matchType": "exact"
  },
  {
    "nr": 33,
    "sourceName": "Болт DIN  931 M 12x 60 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009311100120060",
    "matchedName": "Болт DIN  931 M 12x 60 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (50)",
    "matchType": "exact"
  },
  {
    "nr": 34,
    "sourceName": "Кольцо ГОСТ 13940-86 d 68  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "139400000680000",
    "matchedName": "Кольцо ГОСТ 13940-86 d 68  (10)",
    "matchType": "exact"
  },
  {
    "nr": 35,
    "sourceName": "Штифт DIN   7 20x 80 / ~ ГОСТ 3128-70 исп. 1  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "000070000200080",
    "matchedName": "Штифт DIN   7 20x 80 / ~ ГОСТ 3128-70 исп. 1  (10)",
    "matchType": "exact"
  },
  {
    "nr": 36,
    "sourceName": "Кольцо ГОСТ 13940-86 d140  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "139400001400000",
    "matchedName": "Кольцо ГОСТ 13940-86 d140  (1)",
    "matchType": "exact"
  },
  {
    "nr": 37,
    "sourceName": "Штифт DIN  7978 10x 30 / ГОСТ 9464-79 исп. 1  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "079780000100030",
    "matchedName": "Штифт DIN  7978 10x 30 / ГОСТ 9464-79 исп. 1  (25)",
    "matchType": "exact"
  },
  {
    "nr": 38,
    "sourceName": "Болт DIN  933 M 16x100  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009338100160100",
    "matchedName": "Болт DIN  933 M 16x100  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 39,
    "sourceName": "Болт DIN  931 M  6x 45 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (200)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009311100060045",
    "matchedName": "Болт DIN  931 M  6x 45 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (200)",
    "matchType": "exact"
  },
  {
    "nr": 40,
    "sourceName": "Кольцо DIN  471 d 44  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "004710000440000",
    "matchedName": "Кольцо DIN  471 d 44  (50)",
    "matchType": "exact"
  },
  {
    "nr": 41,
    "sourceName": "Заклепка ГОСТ 10299-80   8x 36 сталь (St) / ~ DIN  660  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006600000080036",
    "matchedName": "Заклепка ГОСТ 10299-80   8x 36 сталь (St) / ~ DIN  660  (100)",
    "matchType": "exact"
  },
  {
    "nr": 42,
    "sourceName": "Винт DIN  912 M  6x 95 12.9 Н/Р / ГОСТ 11738-84  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009122000060095",
    "matchedName": "Винт DIN  912 M  6x 95 12.9 Н/Р / ГОСТ 11738-84  (50)",
    "matchType": "exact"
  },
  {
    "nr": 43,
    "sourceName": "Болт DIN  961 M 24x2x100 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009611100241100",
    "matchedName": "Болт DIN  961 M 24x2x100 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "matchType": "exact"
  },
  {
    "nr": 44,
    "sourceName": "Штифт DIN  1481   2 x  4 / ГОСТ 14229-93 / ISO 8752  (1000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "087520000020004",
    "matchedName": "Штифт DIN  1481   2 x  4 / ГОСТ 14229-93 / ISO 8752  (1000)",
    "matchType": "exact"
  },
  {
    "nr": 45,
    "sourceName": "Болт DIN  933 M 20x 55 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009331100200055",
    "matchedName": "Болт DIN  933 M 20x 55 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 46,
    "sourceName": "Штанга DIN 975 M  6x1000  4.8 оцинк  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009755100060001",
    "matchedName": "Штанга DIN 975 M  6x1000  4.8 оцинк  (5)",
    "matchType": "exact"
  },
  {
    "nr": 47,
    "sourceName": "Шайба DIN  1440 d 90 оцинк / ~ ГОСТ 9649-78  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "014400100900000",
    "matchedName": "Шайба DIN  1440 d 90 оцинк / ~ ГОСТ 9649-78  (1)",
    "matchType": "exact"
  },
  {
    "nr": 48,
    "sourceName": "Винт DIN 7985 M  4x 12 оцинк / ~ ГОСТ 17473-80 исп. 2  (500)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "079854100040012",
    "matchedName": "Винт DIN 7985 M  4x 12 оцинк / ~ ГОСТ 17473-80 исп. 2  (500)",
    "matchType": "exact"
  },
  {
    "nr": 49,
    "sourceName": "Винт DIN  912 M 12x 60 12.9 П/Р / ГОСТ 11738-84  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009121220120060",
    "matchedName": "Винт DIN  912 M 12x 60 12.9 П/Р / ГОСТ 11738-84  (25)",
    "matchType": "exact"
  },
  {
    "nr": 50,
    "sourceName": "Заклепка ГОСТ 10300-80   6x 40 сталь (St) / ~ DIN  661  (250)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006610000060040",
    "matchedName": "Заклепка ГОСТ 10300-80   6x 40 сталь (St) / ~ DIN  661  (250)",
    "matchType": "exact"
  },
  {
    "nr": 51,
    "sourceName": "Винт DIN  915 M  6x 16 45H / ГОСТ 11075-93  (200)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009152000060016",
    "matchedName": "Винт DIN  915 M  6x 16 45H / ГОСТ 11075-93  (200)",
    "matchType": "exact"
  },
  {
    "nr": 52,
    "sourceName": "Винт DIN 7991 M  4x 22 10.9 П/Р / ISO 10642  (500)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "106421000040022",
    "matchedName": "Винт DIN 7991 M  4x 22 10.9 П/Р / ISO 10642  (500)",
    "matchType": "exact"
  },
  {
    "nr": 53,
    "sourceName": "Штифт DIN  6325 16x160 / ГОСТ 24296-93  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "063250000160160",
    "matchedName": "Штифт DIN  6325 16x160 / ГОСТ 24296-93  (5)",
    "matchType": "exact"
  },
  {
    "nr": 54,
    "sourceName": "Винт DIN   84 M  2 x  4 оцинк / ГОСТ 1491-80  (2000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "000844100020004",
    "matchedName": "Винт DIN   84 M  2 x  4 оцинк / ГОСТ 1491-80  (2000)",
    "matchType": "exact"
  },
  {
    "nr": 55,
    "sourceName": "Заклепка ГОСТ 10299-80 22x 70 сталь (St) / ~ DIN  660  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006600000220070",
    "matchedName": "Заклепка ГОСТ 10299-80 22x 70 сталь (St) / ~ DIN  660  (10)",
    "matchType": "exact"
  },
  {
    "nr": 56,
    "sourceName": "Болт DIN 6921 M 16x 25 кл.пр.10.9 оцинк П/Р  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "069211100160025",
    "matchedName": "Болт DIN 6921 M 16x 25 кл.пр.10.9 оцинк П/Р  (25)",
    "matchType": "exact"
  },
  {
    "nr": 57,
    "sourceName": "Штифт DIN  6325 25x100 / ГОСТ 24296-93  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "063250000250100",
    "matchedName": "Штифт DIN  6325 25x100 / ГОСТ 24296-93  (1)",
    "matchType": "exact"
  },
  {
    "nr": 58,
    "sourceName": "Болт DIN  603 M 12x200 8.8 оцинк П/Р / ГОСТ 7802-81  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006038100120200",
    "matchedName": "Болт DIN  603 M 12x200 8.8 оцинк П/Р / ГОСТ 7802-81  (10)",
    "matchType": "exact"
  },
  {
    "nr": 59,
    "sourceName": "Болт DIN  960 M 12x1,25x110 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009601000122110",
    "matchedName": "Болт DIN  960 M 12x1,25x110 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 60,
    "sourceName": "Заклепка ГОСТ 10300-80   5x 28 сталь (St) / ~ DIN  661  (500)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "006610000050028",
    "matchedName": "Заклепка ГОСТ 10300-80   5x 28 сталь (St) / ~ DIN  661  (500)",
    "matchType": "exact"
  },
  {
    "nr": 61,
    "sourceName": "Пружина DIN 2093   80x 31x3,00x5,50 / ~ ГОСТ 3057-90  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "020930080031030",
    "matchedName": "Пружина DIN 2093   80x 31x3,00x5,50 / ~ ГОСТ 3057-90  (25)",
    "matchType": "exact"
  },
  {
    "nr": 62,
    "sourceName": "Винт DIN  912 M 20x190 12.9 П/Р / ГОСТ 11738-84  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009121202200190",
    "matchedName": "Винт DIN  912 M 20x190 12.9 П/Р / ГОСТ 11738-84  (5)",
    "matchType": "exact"
  },
  {
    "nr": 63,
    "sourceName": "Болт DIN  931 M 22x190  5.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009315100220190",
    "matchedName": "Болт DIN  931 M 22x190  5.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "matchType": "exact"
  },
  {
    "nr": 64,
    "sourceName": "Шайба DIN   988  37x 47x0,2  (500)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009880003747020",
    "matchedName": "Шайба DIN   988  37x 47x0,2  (500)",
    "matchType": "exact"
  },
  {
    "nr": 65,
    "sourceName": "Винт DIN  417 M  5x 20 14H / ГОСТ 1478-93  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "004170000050020",
    "matchedName": "Винт DIN  417 M  5x 20 14H / ГОСТ 1478-93  (100)",
    "matchType": "exact"
  },
  {
    "nr": 66,
    "sourceName": "Винт DIN  912 M  5x110  8.8 оцинк Н/Р / ГОСТ 11738-84  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009128100050110",
    "matchedName": "Винт DIN  912 M  5x110  8.8 оцинк Н/Р / ГОСТ 11738-84  (50)",
    "matchType": "exact"
  },
  {
    "nr": 67,
    "sourceName": "Винт DIN  913 M  5x 30 45H / ГОСТ 11074-93  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009132000050030",
    "matchedName": "Винт DIN  913 M  5x 30 45H / ГОСТ 11074-93  (100)",
    "matchType": "exact"
  },
  {
    "nr": 68,
    "sourceName": "Шпонка DIN 6885 A   2x  2x 14 / ГОСТ 23360-78 исп. 1  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "068850010020014",
    "matchedName": "Шпонка DIN 6885 A   2x  2x 14 / ГОСТ 23360-78 исп. 1  (100)",
    "matchType": "exact"
  },
  {
    "nr": 69,
    "sourceName": "Винт DIN   84 M  3x 12 оцинк / ГОСТ 1491-80  (1000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "000844100030012",
    "matchedName": "Винт DIN   84 M  3x 12 оцинк / ГОСТ 1491-80  (1000)",
    "matchType": "exact"
  },
  {
    "nr": 70,
    "sourceName": "Болт DIN  933 M 18x250 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009331100180250",
    "matchedName": "Болт DIN  933 M 18x250 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "matchType": "exact"
  },
  {
    "nr": 71,
    "sourceName": "Винт DIN  912 M  5x 45 нерж A2 Н/Р / ГОСТ 11738-84  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009129200050045",
    "matchedName": "Винт DIN  912 M  5x 45 нерж A2 Н/Р / ГОСТ 11738-84  (100)",
    "matchType": "exact"
  },
  {
    "nr": 72,
    "sourceName": "Винт DIN  914 M  8x 50 45H / ГОСТ 8878-93  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009142000080050",
    "matchedName": "Винт DIN  914 M  8x 50 45H / ГОСТ 8878-93  (50)",
    "matchType": "exact"
  },
  {
    "nr": 73,
    "sourceName": "Болт DIN  961 M 12x1,25x 55 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009611100122055",
    "matchedName": "Болт DIN  961 M 12x1,25x 55 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (25)",
    "matchType": "exact"
  },
  {
    "nr": 74,
    "sourceName": "Болт DIN  933 M 22x130 12.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009332000220130",
    "matchedName": "Болт DIN  933 M 22x130 12.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "matchType": "exact"
  },
  {
    "nr": 75,
    "sourceName": "Заклепка вытяжная DIN 7337 6,4x 10 st/st  (250)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "073374100064010",
    "matchedName": "Заклепка вытяжная DIN 7337 6,4x 10 st/st  (250)",
    "matchType": "exact"
  },
  {
    "nr": 76,
    "sourceName": "Болт DIN  933 M 20x 90  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009338100200090",
    "matchedName": "Болт DIN  933 M 20x 90  8.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "matchType": "exact"
  },
  {
    "nr": 77,
    "sourceName": "Винт DIN   84 M  6x 10 оцинк / ГОСТ 1491-80  (500)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "000844100060010",
    "matchedName": "Винт DIN   84 M  6x 10 оцинк / ГОСТ 1491-80  (500)",
    "matchType": "exact"
  },
  {
    "nr": 78,
    "sourceName": "Болт DIN  931 M 27x140 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009311000270140",
    "matchedName": "Болт DIN  931 M 27x140 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "matchType": "exact"
  },
  {
    "nr": 79,
    "sourceName": "Шайба DIN  6798J M  6 нерж A2 / ГОСТ 10462-81  (1000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "067989640060000",
    "matchedName": "Шайба DIN  6798J M  6 нерж A2 / ГОСТ 10462-81  (1000)",
    "matchType": "exact"
  },
  {
    "nr": 80,
    "sourceName": "Винт DIN  912 M  8x 70 нерж A2 П/Р / ГОСТ 11738-84  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009129220080070",
    "matchedName": "Винт DIN  912 M  8x 70 нерж A2 П/Р / ГОСТ 11738-84  (50)",
    "matchType": "exact"
  },
  {
    "nr": 81,
    "sourceName": "Гайка ГОСТ Р 52645-2006 M 20 кл.пр.10 ХЛ оцинк  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "526450902000000",
    "matchedName": "Гайка ГОСТ Р 52645-2006 M 20 кл.пр.10 ХЛ оцинк  (25)",
    "matchType": "exact"
  },
  {
    "nr": 82,
    "sourceName": "Винт DIN  551 M  3x  8 14H / ГОСТ 1477-93  (200)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "005510000030008",
    "matchedName": "Винт DIN  551 M  3x  8 14H / ГОСТ 1477-93  (200)",
    "matchType": "exact"
  },
  {
    "nr": 83,
    "sourceName": "Заклепка-гайка шестигранная M 12, L27,0 (2,0-5,0) оцинк  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "884260100120000",
    "matchedName": "Заклепка-гайка шестигранная M 12, L27,0 (2,0-5,0) оцинк  (50)",
    "matchType": "exact"
  },
  {
    "nr": 84,
    "sourceName": "Шпонка DIN 6885 A 12x  8x 55 / ГОСТ 23360-78 исп. 1  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "068850010120055",
    "matchedName": "Шпонка DIN 6885 A 12x  8x 55 / ГОСТ 23360-78 исп. 1  (10)",
    "matchType": "exact"
  },
  {
    "nr": 85,
    "sourceName": "Винт DIN  912 M 12x 40 нерж A2 П/Р / ГОСТ 11738-84  (25)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009129200120040",
    "matchedName": "Винт DIN  912 M 12x 40 нерж A2 П/Р / ГОСТ 11738-84  (25)",
    "matchType": "exact"
  },
  {
    "nr": 86,
    "sourceName": "Гайка DIN  315 M  6 нерж A2 / ~ ГОСТ 3032-76  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "003159200060000",
    "matchedName": "Гайка DIN  315 M  6 нерж A2 / ~ ГОСТ 3032-76  (100)",
    "matchType": "exact"
  },
  {
    "nr": 87,
    "sourceName": "Болт DIN  933 M 18x 90 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009331000180090",
    "matchedName": "Болт DIN  933 M 18x 90 10.9 / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 88,
    "sourceName": "Штифт DIN   1 12x100 / ~ ГОСТ 3129-70 исп. 2  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "000010020120100",
    "matchedName": "Штифт DIN   1 12x100 / ~ ГОСТ 3129-70 исп. 2  (10)",
    "matchType": "exact"
  },
  {
    "nr": 89,
    "sourceName": "Гайка DIN  439 M 27x1,5 оцинк / ГОСТ 5916-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "004394170272000",
    "matchedName": "Гайка DIN  439 M 27x1,5 оцинк / ГОСТ 5916-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 90,
    "sourceName": "Болт DIN  931 M 14x180 12.9  / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009312000140180",
    "matchedName": "Болт DIN  931 M 14x180 12.9  / ГОСТ 7798-70 / ГОСТ 7805-70  (10)",
    "matchType": "exact"
  },
  {
    "nr": 91,
    "sourceName": "Гайка DIN  934 M 10x1,25 кл.пр.10 оцинк / ГОСТ 5915-70 / ГОСТ 5927-70  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009341150100125",
    "matchedName": "Гайка DIN  934 M 10x1,25 кл.пр.10 оцинк / ГОСТ 5915-70 / ГОСТ 5927-70  (100)",
    "matchType": "exact"
  },
  {
    "nr": 92,
    "sourceName": "Болт DIN  933 M 24x140 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009331100240140",
    "matchedName": "Болт DIN  933 M 24x140 10.9 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (1)",
    "matchType": "exact"
  },
  {
    "nr": 93,
    "sourceName": "Шплинт DIN  94  6,3x 80 оцинк / ГОСТ 397-79  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "000940100063080",
    "matchedName": "Шплинт DIN  94  6,3x 80 оцинк / ГОСТ 397-79  (50)",
    "matchType": "exact"
  },
  {
    "nr": 94,
    "sourceName": "Шайба DIN   433 M  6 оцинк / ГОСТ 10450-78  (1000)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "004330100064000",
    "matchedName": "Шайба DIN   433 M  6 оцинк / ГОСТ 10450-78  (1000)",
    "matchType": "exact"
  },
  {
    "nr": 95,
    "sourceName": "Болт DIN  931 M 16x190  5.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009315100160190",
    "matchedName": "Болт DIN  931 M 16x190  5.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (5)",
    "matchType": "exact"
  },
  {
    "nr": 96,
    "sourceName": "Пружина DIN 2093 125x 51x5,00x8,90 / ~ ГОСТ 3057-90  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "020930001255105",
    "matchedName": "Пружина DIN 2093 125x 51x5,00x8,90 / ~ ГОСТ 3057-90  (5)",
    "matchType": "exact"
  },
  {
    "nr": 97,
    "sourceName": "Винт DIN  912 M 12x380 12.9 Н/Р / ГОСТ 11738-84  (5)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009122000120380",
    "matchedName": "Винт DIN  912 M 12x380 12.9 Н/Р / ГОСТ 11738-84  (5)",
    "matchType": "exact"
  },
  {
    "nr": 98,
    "sourceName": "Шайба DIN   440 M  6 нерж A2",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "004409200060000",
    "matchedName": "Шайба DIN   440 M  6 нерж A2",
    "matchType": "exact"
  },
  {
    "nr": 99,
    "sourceName": "Кольцо ГОСТ 13943-86 d 37  (50)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "139430000370000",
    "matchedName": "Кольцо ГОСТ 13943-86 d 37  (50)",
    "matchType": "exact"
  },
  {
    "nr": 100,
    "sourceName": "Болт DIN  933 M 10x 14  5.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (100)",
    "unit": "шт",
    "quantity": 1,
    "matchedSku": "009335100100014",
    "matchedName": "Болт DIN  933 M 10x 14  5.8 оцинк / ГОСТ 7798-70 / ГОСТ 7805-70  (100)",
    "matchType": "exact"
  }
]);

function goldenCsvPath() {
  return path.join(__dirname, GOLDEN_META.sourceCsv);
}

function findBySku(sku) {
  const key = String(sku || "").trim();
  return GOLDEN_ROWS.find((row) => row.matchedSku === key) || null;
}

function findBySourceName(name) {
  const key = String(name || "").trim();
  return GOLDEN_ROWS.find((row) => row.sourceName === key) || null;
}

function skuSet() {
  return new Set(GOLDEN_ROWS.map((row) => row.matchedSku));
}

module.exports = {
  GOLDEN_META,
  GOLDEN_ROWS,
  goldenCsvPath,
  findBySku,
  findBySourceName,
  skuSet,
};
