// Italian — falls back to English for missing keys via i18next
import English from "../en/offerKp.js";

const TRANSLATIONS = {
  ...English,
  brand: {
    ...English.brand,
    distributor:
      "Piattaforma di assistenza IA per flussi legali, compliance e audit.",
  },
  nav: {
    capabilities: "Funzionalità",
    profiles: "Profili utente",
    quoting: "Preventivo guidato",
    contact: "Contatto",
    signIn: "Accedi",
    openBot: "Apri bot",
    regions: "Francia · Italia · Svizzera",
  },
  hero: {
    eyebrow: "Offer KP · Proposte commerciali",
    title: "La piattaforma IA per le relazioni commerciali",
    subtitle:
      "Automatizza analisi legali, controlli di conformita e supporto audit in un unico spazio conversazionale.",
    ctaPrimary: "Prova il bot pubblico",
    ctaSecondary: "Accesso partner",
  },
  footer: {
    legal: "Offer KP v5 · Riservato",
    returnApp: "Torna all'app",
  },
  sav: {
    title: "Richiesta post-vendita",
    subtitle: "Il nostro team risponderà entro 24 ore",
    issueType: "Tipo di problema",
    orderRef: "Riferimento ordine / preventivo",
    description: "Descrizione",
    descriptionPlaceholder: "Descrivi il problema in dettaglio…",
    photos: "Foto",
    cancel: "Annulla",
    submit: "Invia ticket",
    submitted: "Ticket creato",
    submittedDetail: "Il tuo ticket SAV è stato creato e il team admin è stato notificato.",
  },
};

export default TRANSLATIONS;
