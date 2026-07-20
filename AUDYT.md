# Audyt offer-ibm (2026-07-20)

Zakres: szybkość web UI, jakość UI/UX, jakość generacji i agenta (flow: upload PDF → dopasowanie produktów w ShopDB → generacja KP).
Metoda: audyt statyczny kodu (test na żywo http://offer-ibm.ru/ wymaga rozszerzenia Claude in Chrome — strona to SPA, sam HTML jest pusty).

---

## 1. Szybkość web UI

### Wdrożone poprawki ✅

| # | Zmiana | Plik | Efekt |
|---|--------|------|-------|
| 1 | Wycięcie 20 nieużywanych języków z entry bundle (UI wspiera ru/pl/de/fr/kk + en) | `frontend/src/locales/resources.js` | ~1,5 MB mniej źródeł w głównym bundle (~200–400 KB mniej po minifikacji, mniej JS do sparsowania na starcie) |
| 2 | Nagłówki `Cache-Control`: hashowane chunki → `immutable, 1y`; `index.js`/`index.css`/HTML → `no-cache` (ETag/304); reszta → 1 dzień | `server/index.js` | Powtórne wizyty nie pobierają ponownie chunków; entry waliduje się przez 304 |
| 3 | Tańszy comparator `memo` — `JSON.stringify` dużych źródeł RAG liczył się dla każdej wiadomości przy każdym chunku streamu | `frontend/.../HistoricalMessage/index.jsx` | Płynniejszy streaming w długich wątkach |

**Wymagany rebuild frontendu (`yarn prod:frontend`) i deploy, żeby zmiany 1 i 3 trafiły na produkcję.**

### Do zrobienia (priorytet malejąco)

1. **HTTPS/HTTP2.** Strona chodzi po `http://`. Poza bezpieczeństwem: brak HTTP/2 (wolniejsze równoległe pobieranie chunków), brak PWA, brak clipboard API. Railway daje TLS out-of-the-box — skonfiguruj domenę z certyfikatem. *Największy pojedynczy zysk.*
2. **Brotli.** `compression()` w Node to tylko gzip. Entry 1,1 MB → gzip ~330 KB, brotli ~260 KB. Najprościej: CDN/nginx przed Node albo pre-kompresja w build (`vite-plugin-compression`) + serwowanie `.br`.
3. **Entry bundle nadal ~1,1 MB.** Po wycięciu locales zejdzie, ale w entry siedzi wszystko co importuje `main.jsx` statycznie. Otwórz `frontend/bundleinspector.html` po buildzie i wytnij kolejnych kandydatów (np. `moment` — używany w 9 plikach, zamiana na `dayjs` lub natywny `Intl` ≈ −60 KB; KaTeX/highlight w markdown — lazy).
4. **Assety bez hashy.** `assetFileNames` w `vite.config.js` zwraca oryginalne nazwy (fonty, obrazy) — dlatego dostały tylko 1-dniowy cache. Przywróć domyślne hashowanie assetów, wtedy podpadną pod `immutable`.
5. **Podwójny scroll-handler** w `ChatHistory` (`onScroll={handleScroll}` + osobny listener z `debounce` tworzonym co render) — drobne, do sprzątnięcia.

---

## 2. UI/UX

### Problemy

1. **Brak feedbacku podczas najdłuższego etapu.** Enrich (parse PDF → matching linii → search agent) potrafi trwać dziesiątki sekund, a pierwszy sygnał dla użytkownika (`offerKpQuotePanel`, `progressStage: "matched"`) przychodzi dopiero PO dopasowaniu. Do tego momentu user patrzy w spinner. **Rekomendacja:** emituj etapy wcześniej — `parsing` (po odczycie PDF, z liczbą rozpoznanych pozycji), `searching` (start matchingu, np. licznik „linia 12/40"). Backend ma już kanał SSE i typ zdarzenia — to głównie dopisanie 2 emisji w `enrichInquiryLinesFromPdf` + obsługa stanów w panelu.
2. **Spinner po zakończeniu odpowiedzi.** Po ostatnim tokenie serwer jeszcze czeka na: post-processing → generację artefaktów PDF/DOCX → **LLM-owe follow-up suggestions** — i dopiero wtedy wysyła `finalizeResponseStream`. Odpowiedź wygląda na „zawieszoną". **Rekomendacja:** finalizuj stream od razu po artefaktach, a follow-upy wysyłaj osobnym zdarzeniem po fakcie (nie blokują zapisu czatu).
3. **Meta/og tagi.** `MetaGenerator` ma `og:url: https://offer-kp.local` (placeholder) — podgląd linku w komunikatorach będzie zepsuty. Dev `index.html` nadal brandowany „AnythingLLM".
4. **Auto-scroll przy streamie** opiera się na progu 2 px od dołu — przy szybkim streamie z obrazkami/tabelami potrafi „uciekać". Obserwować po wdrożeniu progress-stage'ów.

### Co jest dobre

Lazy routing na poziomie routera, panel draftu KP pushowany w trakcie streamu, karty plików (Preview/Download) w czacie, obsługa wersji językowych z migracją na ru.

---

## 3. Jakość generacji i agenta

### Co jest dobre (nie psuć)

- **Tryb ShopDB-only dla KP** — przy żądaniu KP wyłącza vector search i web enrich, co domyka ścieżkę halucynacji cen. Trigger działa też od samego załączonego PDF (`parsedTextHasQuoteSignals`), nie tylko od frazy.
- **Zasada cen:** tylko `exact`/`analog` dostają cenę z katalogu; `similar`/`size_mismatch` → „pod zamówienie" bez podstawiania cudzej ceny; podpowiedź podobnego produktu bez jego ceny w linii KP. To poprawny design.
- Per-line matching z fallbackiem (search agent → ShopDB SQL agent), błąd jednej linii nie wywala reszty (`buildLineMatchErrorFallback`).
- Styl-polish **pomijany** dla KP (druga tura LLM nie przepisuje liczb) — słusznie.
- Osobny prompt katalogowy z twardymi zakazami („nie pisz, że nie masz dostępu do bazy").

### Ryzyka / poprawki

1. **Latencja enrich = główne wąskie gardło.** `SHOP_DB_ENRICH_TIMEOUT_MS` domyślnie 60 s **+ pełny retry po timeout** → do 120 s zanim poleci pierwszy token. Przy dużej zaявce: N linii × (SQL search + ewentualny LLM fallback `searchAgent`) przy `OFFER_KP_MATCH_CONCURRENCY=4`. **Rekomendacje:** (a) obniż domyślny timeout do ~30 s, retry tylko dla fazy, która padła, nie całego enrich; (b) podnieś concurrency dla zapytań >20 linii (SQL to zniesie); (c) cache wyników matchingu linii per (tekst linii → productId) w ramach wątku — follow-upy „dodaj pozycję 5" nie powinny liczyć wszystkiego od nowa.
2. **Podwójne tokeny z PDF.** Pełny tekst załącznika idzie do `contextTexts` („ПРИКРЕПЛЁННЫЙ ДОКУМЕНТ") *i równolegle* jego pozycje wracają jako bloki `[Каталог · PDF]`. Przy trybie KP z gotowym draftem rozważ skrócenie surowego tekstu PDF (np. nagłówek + stopka + pozycje nierozpoznane) — mniejszy prompt, mniejsze koszty, mniej okazji do konfliktu źródeł.
3. **Kruchy re-parsing własnego formatu.** `autoQuoteArtifacts.parseCatalogBlock` wyciąga cenę/URL regexami z tekstu bloku katalogu, który sam wygenerował `buildProductExcerpt`. Zmiana formatu bloku cicho zepsuje artefakty. **Rekomendacja:** przekazuj strukturalne dane (obiekt produktu) obok tekstu bloku zamiast parsować string.
4. **Dodatkowe wywołania LLM na request:** `quoteIntentJudge`, `searchAgent` fallback (per linia!), follow-up suggestions, OCR vision. Każde to koszt i latencja. Warto dodać zbiorczy licznik w `metrics`/`ragTrace` (ile sub-wywołań LLM per odpowiedź), żeby regresje było widać.
5. **Testy jakości matchingu.** Jest harness (`test_files/*.expected.csv`) — rozszerz o przypadki: analogi DIN↔ГОСТ, rozmiar bez pokrycia, pozycje spoza katalogu, PDF po OCR z błędami. To najtańszy sposób pilnowania jakości KP przy zmianach promptów.

---

## 4. Następne kroki

1. Rebuild + deploy (zmiany z sekcji 1).
2. HTTPS + brotli (infra, bez zmian w kodzie).
3. Progress-stage'y w enrich + finalize przed follow-upami (największy skok odczuwalnej jakości).
4. Timeout/concurrency/cache w matchingu.
5. Test na żywo: po podłączeniu rozszerzenia Claude in Chrome mogę zmierzyć realne czasy ładowania i przejść cały flow KP na offer-ibm.ru.
