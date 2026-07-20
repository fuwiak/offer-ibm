// Looking for a language to translate Offer KP to?
// Create a `common.js` file in the language's ISO code https://www.w3.org/International/O-charset-lang.html
// eg: Spanish => es/common.js
// eg: French => fr/common.js
// You should copy the en/common.js file as your template and just translate every string in there.
// By default, we try to see what the browsers native language is set to and use that. If a string
// is not defined or is null in the translation file, it will fallback to the value in the en/common.js file
// RULES:
// The EN translation file is the ground-truth for what keys and options are available. DO NOT add a special key
// to a specific language file as this will break the other languages. Any new keys should be added to english
// and the language file you are working on.

// Contributor Notice: If you are adding a translation you MUST locally run `yarn verify:translations` from the root prior to PR.
// please do not submit PR's without first verifying this test passes as it will tell you about missing keys or values
// from the primary dictionary.

// PERF: OfferKP UI supports only ru/pl/de/fr/kk (+en as key ground-truth).
// Do NOT statically import other languages — every import here lands in the
// main entry bundle (~1.5MB of locale source was shipped to every visitor).
import English from "./en/common.js";
import French from "./fr/common.js";
import German from "./de/common.js";
import Russian from "./ru/common.js";
import Polish from "./pl/common.js";
import Kazakh from "./kk/common.js";
import OfferKpEn from "./en/offerKp.js";
import OfferKpFr from "./fr/offerKp.js";
import OfferKpRu from "./ru/offerKp.js";
import OfferKpDe from "./de/offerKp.js";
import OfferKpPl from "./pl/offerKp.js";
import OfferKpKk from "./kk/offerKp.js";

export const defaultNS = "common";
export const resources = {
  en: {
    common: English,
    offerKp: OfferKpEn,
  },
  de: {
    common: German,
    offerKp: OfferKpDe,
  },
  fr: {
    common: French,
    offerKp: OfferKpFr,
  },
  ru: {
    common: Russian,
    offerKp: OfferKpRu,
  },
  pl: {
    common: Polish,
    offerKp: OfferKpPl,
  },
  kk: {
    common: Kazakh,
    offerKp: OfferKpKk,
  },
};
