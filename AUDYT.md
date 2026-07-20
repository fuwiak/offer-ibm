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

---

## 5. Dodatek (2026-07-21): mocne/słabe strony backendu, techniki przyspieszania, ocena stanowiska ML

Zakres rozszerzony na żądanie: pełny audyt trzech podsystemów (czytanie plików/OCR, matching ShopDB, generacja LLM) + research zewnętrzny (web search) o technikach przyspieszania + ocena, czy kompetencje z opisu stanowiska ML Engineer (BERT/LoRA/PEFT, matching/retrieval, quantization) realnie pomogłyby temu projektowi.

### 5.1 Mocne strony (nie psuć)

| Obszar | Co jest dobre |
|---|---|
| OCR (`collector/utils/OCRLoader`, `SmartOCRAgent`) | 2-stronicowy "probe" przed pełnym OCR (early-abort na nieczytelnym skanie), worker-pool do 4 wątków Tesseract z kolejką stron, waterfall 9 strategii zamiast jednej sztywnej ścieżki |
| `parseCache` (`collector/utils/parseCache`) | Cache po fingerprint pliku (rozmiar + próbki bajtów) — ten sam PDF wysłany drugi raz nie jest re-OCR-owany |
| Matching ShopDB (`shopDbSearch.js`) | 5 strategii SQL leci równolegle (`Promise.all`), nie sekwencyjnie |
| Cache'owanie w matchingu | Trzy niezależne warstwy: `ShopDbQueryCache` (SQL), `agentResultCache` (wyniki agenta), `lineMatchCache` per-wątek (follow-up „dodaj pozycję 5" nie liczy wszystkiego od nowa) |
| `SHOP_DB_SEARCH_AGENT_LLM=0` domyślnie | Najdroższa ścieżka (LLM per linia) jest **wyłączona domyślnie** — świadoma decyzja kosztowa, nie przeoczenie |
| Streaming + keepalive | Główna odpowiedź stream'uje end-to-end; 15 s keepalive w SSE utrzymuje połączenie przez wieloetapowy post-processing zamiast go zrywać |
| `skipStylePolish` dla KP | Druga tura LLM nie dotyka liczb w dokumencie — słuszna ochrona danych |
| `OFFER_KP_MATCH_CONCURRENCY` | Świadomie niski default (1–2), bo „mały pool MySQL" — to nie przeoczenie wydajności, tylko celowy trade-off stabilność > szybkość |

### 5.2 Słabe strony / ryzyka

1. **Matching to w 100% leksyka, zero embeddingów.** `nameSimilarity.js` liczy TF-IDF cosine + Levenshtein ręcznie w JS — to nie semantyczne wyszukiwanie, tylko zaawansowane dopasowanie tekstu. Synonimy, warianty транслитерacji (ГОСТ/GOST), parafrazy pozycji spoza katalogu i tak lądują na LLM-fallbacku (`searchAgent.pickProductsWithLlm`, per linia, sekwencyjnie). To największa pojedyncza dźwignia do poprawy — patrz 5.4.
2. **Do 6+N sekwencyjnych round-tripów LLM na jedną wiadomość**: quote-intent judge → per-line LLM fallback (jeśli włączony) → generacja → Yandex fact-check → OpenRouter/ГАРАНТ fact-check → style-polish → follow-up suggestions. Kroki fact-check (Yandex i OpenRouter/ГАРАНТ) działają na **tym samym** wygenerowanym tekście, niezależnie od siebie, a mimo to lecą sekwencyjnie (`generation.js`, kroki 12a→12b) zamiast `Promise.all` — to czysta zmiana w kodzie, bez nowej infrastruktury, skracająca krytyczną ścieżkę o pełny round-trip.
3. **Brak prompt/KV cache dla realnie używanych providerów.** `cache_control` (Anthropic-style prompt caching) istnieje tylko w `AiProviders/anthropic`, którego produkcja nie używa — LM Studio i OpenRouter (faktyczni providerzy) nie mają nic. Duży współdzielony blok systemowy (instrukcje ГАРАНТ/Yandex/Google + RAG) jest liczony od zera przy każdym request.
4. **Pojedynczy T4 16GB dzielony między model wizyjny a czatowy przez pełny unload/reload** (`lms unload --all` → `lms load`, `docker/lmstudio-switch.sh`). Każde przełączenie OCR-wizja ↔ chat to kilka–kilkanaście sekund martwego czasu, bez możliwości nakładania się zapytań.
5. **LM Studio zamiast silnika z continuous batching.** Brak PagedAttention/prefix caching klasy vLLM czy `llama-server` — przy równoległych użytkownikach i dużym współdzielonym prefiksie promptu to bezpośrednia strata przepustowości.
6. `parseCache` tylko w pamięci, 50 wpisów, restart czyści wszystko — dla realnego workflow (retry, ten sam PDF od klienta drugi raz) cache szybko się „wypłukuje".
7. Kruchy re-parsing formatu bloku katalogowego (`autoQuoteArtifacts.parseCatalogBlock`) — już odnotowane w sekcji 3, wciąż aktualne jako ryzyko processingu.

### 5.3 Techniki przyspieszania — z researchu zewnętrznego, dopasowane do konkretnego kodu

**Generacja LLM**
- `Promise.all` dla Yandex fact-check + OpenRouter/ГАРАНТ fact-check zamiast sekwencyjnego `await`/`await` w `generation.js` — zero nowej infry, jeden round-trip mniej na krytycznej ścieżce.
- Prefix/KV-cache reuse: `llama-server` (llama.cpp) ma `--prompt-cache` i slot-matching po podobieństwie prefiksu promptu — w publicznych benchmarkach TTFT spada z ~1,7 s do ~0,03 s przy trafieniu w cache. Przy dużym, w większości stałym system-prompcie tego projektu (instrukcje ГАРАНТ/Yandex/Google) to bezpośrednio adresuje pkt 5.2.3. [Tutorial: KV cache reuse with llama-server](https://github.com/ggml-org/llama.cpp/discussions/13606)
- vLLM z `--enable-prefix-caching` daje ~30% throughput przy współdzielonym system-prompcie „za darmo" (jedna flaga) — rozważyć jako zamiennik/dopełnienie LM Studio, jeśli chodzi o wiele równoległych sesji. [vLLM Optimization for Scalable Scheduling, Batching & Concurrent Inference](https://medium.com/@abonia/vllm-optimization-for-scalable-scheduling-batching-concurrent-inference-a050f3ab1f06)

**Matching ShopDB (retrieve → rerank zamiast LIKE + LLM-per-linia)**
- Klasyczny wzorzec: bi-encoder (sentence-transformers) liczy embeddingi całego katalogu **raz**, zapytanie enkodowane w locie, top-K po cosine w milisekundach; cross-encoder dogrywa tylko top ~10 kandydatów przed ewentualnym LLM-em. [Retrieve & Re-Rank — Sentence Transformers docs](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)
- Katalog jest w MySQL i prawdopodobnie < 100k SKU — nie trzeba nowej bazy wektorowej. Zgodnie z filozofią projektu (wszystkie cache'e są in-memory) najprostsze rozwiązanie to biblioteka ANN in-process (np. `hnswlib-node`/`usearch`) obok istniejących strategii SQL LIKE, a nie osobna infrastruktura. FAISS nie wspiera hybrydowego BM25+wektor natywnie; pgvector wymagałby Postgresa, którego tu nie ma. [Hybrid Search in 100 Lines: BM25 + pgvector with RRF](https://dev.to/gabrielanhaia/hybrid-search-in-100-lines-bm25-pgvector-with-rrf-merge-58cn)
- Ważna nauka z researchu: embeddingi „rozmywają" identyfikatory/SKU/kody ГОСТ — dlatego istniejące strategie `exact_sku`/`structured`/`keywords` (leksykalne) **nie powinny** zniknąć, tylko zostać nogą „sparse" w hybrydzie, z dense (embeddingi) jako drugą nogą i fuzją (RRF) na końcu. Połowa hybrydy już istnieje w kodzie.

**Czytanie plików / OCR**
- Tesseract.js pozostaje słusznym wyborem jako CPU-bound fallback (mały footprint, działa wszędzie) — literatura to potwierdza. Przyspieszenie ma sens tylko jeśli collector faktycznie ma dostęp do GPU T4 (do zweryfikowania) — wtedy PaddleOCR (~120 stron/min na RTX 3090 vs ~25 stron/min Tesseract na CPU) albo Surya (lepszy na layout-heavy dokumentach) to realny zysk na ciężkich skanach. Nie wdrażać na ślepo — najpierw zmierzyć, jak często SmartOCRAgent w ogóle schodzi do pełnego OCR (probe powinien to już ograniczać). [PaddleOCR vs Tesseract vs EasyOCR: OCR Speed and Accuracy 2026](https://www.codesota.com/ocr/paddleocr-vs-tesseract)

**GPU / quantization**
- Agresywniejsza kwantyzacja (AWQ/GPTQ 4-bit) modelu wizyjnego (`qwen3-vl-8b`, obecnie ctx 8192) mogłaby zejść poniżej ~5–6 GB, co przy 16 GB T4 pozwoliłoby trzymać **oba** modele (eyes + brain) rezydentne jednocześnie i wyeliminować `lms unload --all`/`lms load` na każde przełączenie — to prawdopodobnie pojedyncza najbardziej wartościowa zmiana infrastrukturalna z całego audytu, bo usuwa twardy, synchroniczny stall z każdego requestu mieszającego OCR-wizję i czat. [Running Multiple LLMs Simultaneously: GPU Memory Management](https://dasroot.net/posts/2026/03/running-multiple-llms-gpu-memory-management/)

### 5.4 Czy techniki z opisu stanowiska (BERT/LoRA/PEFT, matching, quantization, multi-GPU) pomogą temu projektowi?

Krótko: **tak, w części matching/retrieval — to jest niemal książkowe dopasowanie do sekcji 5.2.1/5.3**; reszta opisu stanowiska jest przewymiarowana względem obecnej skali projektu.

| Kompetencja z opisu | Dopasowanie do tego projektu |
|---|---|
| Dostrajanie BERT z LoRA/PEFT | **Wysokie.** Dostrojenie małego encodera bi-encoderowego na parach (linia zapytania ↔ dopasowany produkt) wydobytych z istniejącego golden setu `test_files/*.expected.csv` + logów matchingu produkcyjnego, jest realistyczne przy skromnym zbiorze domenowym — dokładnie tam LoRA radzi sobie lepiej niż full fine-tuning (raportowane +1,6–4,6 pkt out-of-domain vs full FT). |
| Matching-modele: generacja kandydatów, ranking, offline/online walidacja | **Wysokie.** To 1:1 opis tego, co dziś robi `productSearchAgent.js` ręcznie (SQL LIKE + TF-IDF + LLM). Bi-encoder (kandydaci) + cross-encoder (ranking) + rozbudowa golden setu (offline walidacja, już wspomniana w sekcji 3.5 jako „do zrobienia") to naturalne rozszerzenie roli. |
| Bi-encoder / cross-encoder | **Wysokie.** Wprost adresuje 5.2.1 — patrz 5.3. |
| Optymalizacja inferencji: quantization, distillation | **Średnie/wysokie.** Bezpośrednio adresuje problem współdzielonego T4 (5.2.4) — quantization modelu wizyjnego, ewentualnie distillation lokalnego modelu-agenta pod mniejszy footprint. |
| Multi-GPU / distributed training | **Niskie tu i teraz.** Projekt działa na pojedynczym T4 wyłącznie do inferencji; dotrenowanie małego bi-encodera LoRA mieści się na jednym GPU (nawet tym samym T4, poza godzinami szczytu). Istotne dopiero przy realnym treningu dużych modeli od zera. |
| Uplift-modeling, highload ML-systemy | **Niskie.** To chatbot-KP dla jednego sklepu, nie system rekomendacji/pricingu z eksperymentami treatment/control na dużą skalę. |

**Wniosek dla procesu rekrutacyjnego:** jeśli ta oferta ma finansować pracę nad tym repo, warto wagować kryteria w stronę matching/retrieval + PEFT (to realny, zidentyfikowany dług techniczny), a multi-GPU/uplift/highload traktować jako „nice to have", nie „must have" — inaczej ryzyko zatrudnienia profilu niedopasowanego do faktycznej skali problemu.

### 5.5 Priorytety (dodatek)

1. `Promise.all` dla dwóch fact-checków (5.2.2) — najtańsza zmiana, jeden PR.
2. Zmierzyć rzeczywistą częstość pełnego OCR i LLM-fallbacku per linia (dziś brak licznika — patrz pkt 3.4 głównego audytu) **przed** inwestowaniem w bi-encoder/kwantyzację — bez danych nie wiadomo, który koszt boli bardziej.
3. ~~Prototyp bi-encoder + ANN in-process dla ShopDB matching~~ ✅ **Zrobione 2026-07-21** — patrz 5.6.
4. Kwantyzacja modelu wizyjnego pod współrezydencję z modelem czatowym na T4 — usuwa stall przełączania.
5. `llama-server`/vLLM prefix-caching jako alternatywa dla LM Studio, jeśli liczba równoległych sesji zacznie rosnąć.

### 5.6 Wdrożenie: lekki embedding-reranking w matchingu (2026-07-21)

Dodany jako **dodatkowa, opcjonalna warstwa nad** istniejącym TF-IDF/Levenshtein/Jaro-Winkler — struktura `nameSimilarity.js`/`shopDbSearch.js` (SQL LIKE, klastrowanie `productsAreSimilar`/`pickCheaperAmongSimilar`) jest nietknięta.

- **Nowy plik:** `server/utils/offerKp/embeddingSimilarity.js` — model `MintplexLabs/multilingual-e5-small` przez `@xenova/transformers` (ta sama biblioteka i mechanizm ładowania/fallbacku co istniejący `NativeEmbedder` w `server/utils/EmbeddingEngines/native`, reużyty przez podklasę z nadpisanym `getEmbeddingModel()` — zero zmian w istniejącym kodzie RAG-embeddera). CPU-only, nie dotyka GPU/LM Studio/T4.
- **Punkt wpięcia:** `nameSimilarity.js#searchByNameSimilarity` — nowa funkcja `applyEmbeddingBoost` reranżuje **już przefiltrowanych przez TF-IDF** kandydatów (nie surową pulę SQL LIKE, zostaje „lekki"), blendując `_nameSimilarity = max(base, base·(1-w) + cosine·w)`, domyślnie `w=0.3`.
- **Cache:** osobna in-memory mapa embeddingów produktów (TTL 24h, 4000 wpisów) w tym samym stylu co `ShopDbQueryCache`/`lineMatchCache` — nazwy produktów rzadko się zmieniają, więc powtórne zapytania nie re-embedują całego katalogu.
- **Fail-safe:** każdy błąd (brak sieci przy pierwszym pobraniu modelu ~487MB, itp.) wyłącza embedding-boost na resztę procesu i pipeline **milcząco wraca do czystego TF-IDF** — identyczne zachowanie jak przed zmianą. Kill-switch: `SHOP_DB_EMBEDDING_SIMILARITY=0`.
- **Env vars:** `SHOP_DB_EMBEDDING_SIMILARITY`, `SHOP_DB_EMBEDDING_MODEL`, `SHOP_DB_EMBEDDING_WEIGHT`, `SHOP_DB_EMBEDDING_MAX_CANDIDATES`, `SHOP_DB_EMBEDDING_CACHE_TTL_MS`, `SHOP_DB_EMBEDDING_CACHE_MAX_ENTRIES` — patrz `server/.env.example` (sekcja ShopDB).
- **Testy:** `server/__tests__/utils/offerKp/embeddingSimilarity.test.js` (kill-switch, puste inputy — bez sieci). Pełny `server/__tests__/utils/offerKp/*` (367 testów, w tym `goldenSet.test.js`) przechodzi bez zmian.
- **Świadomy zakres:** reranking działa tylko na kandydatach, które SQL LIKE w ogóle znalazł (jakiś token wspólny) — to **nie jest** pełne semantyczne wyszukiwanie kandydatów (embedding jako pierwsza noga „retrieve"), tylko poprawa kolejności/jakości w obrębie już znalezionych. Pełny retrieve-by-embedding (ANN nad całym katalogem) to większa zmiana, wciąż otwarta w 5.3/5.5.

---

## 6. Pętla uczenia bez fine-tuningu + audyt „Чтение документа..." (2026-07-21, dodatek 2)

### 6.1 Golden set jako źródło poprawek matchingu (bez trenowania modeli)

Kontekst: `test_files/*.expected.csv` do tej pory walidował **tylko ekstrakcję** (`source_name/unit/quantity`, patrz `test_files/README.md`) — nic z dodanych przykładów nie wpływało na jakość dopasowania do katalogu. Dodano dwa mechanizmy, które realnie „uczą się" z przykładów, bez trenowania żadnego modelu:

1. **Tabela korekt (override)** — `server/utils/offerKp/goldenCorrections.js`. Rozszerza istniejący schemat CSV o OPCJONALNE kolumny `matched_sku,matched_name,match_type` (exact/analog/none) — pliki bez tych kolumn (czysto ekstrakcyjne, jak dziś) są ignorowane, więc nic się nie psuje. Wpięte w `matchInquiryLines.js#matchInquiryLine`: dokładny (znormalizowany) powtórzony wiersz zapytania → autorytatywna odpowiedź operatora, sprawdzana PRZED żywym wyszukiwaniem. Cena/nazwa zawsze dociągane na żywo z ShopDB po SKU (`searchByExactSku`) — golden set nigdy nie jest źródłem ceny, tylko wskazuje **który** produkt. Jeśli SKU z golden setu już nie istnieje w katalogu — pipeline spada z powrotem do normalnego wyszukiwania (nie milczy jako „brak dopasowania").
2. **Few-shot retrieval do LLM fallbacku** — `server/utils/offerKp/goldenFewShot.js`. Reużywa embedding z 5.6: embeduje nową linię zapytania, wyciąga k (domyślnie 3, próg podobieństwa 0.55) najbardziej podobnych POZYTYWNYCH przykładów z golden setu i wstrzykuje je do prompta `searchAgent.pickProductsWithLlm` jako „tak dopasowaliśmy podobne przypadki wcześniej". Im więcej przykładów w golden secie, tym trafniejsze podpowiedzi — bez trenowania czegokolwiek.
3. Auto-kalibracja progów (`SHOP_DB_EMBEDDING_WEIGHT`, `SHOP_DB_NAME_SIMILARITY_MIN` itd.) offline-skryptem pod golden set — **nie zrobiona**, zostaje jako kolejny krok, gdy golden set urośnie.

**Env vars:** `SHOP_DB_GOLDEN_CORRECTIONS` (kill-switch), `SHOP_DB_FEW_SHOT_EXAMPLES`, `SHOP_DB_FEW_SHOT_MIN_SIMILARITY`. **Testy:** `goldenCorrections.test.js`, `goldenFewShot.test.js` — pełny `server/__tests__` (526 testów) zielony.

**Żeby to zadziałało**, wpisy w `test_files/*.expected.csv` muszą mieć wypełnione `matched_sku`/`match_type` — same `nr,source_name,unit,quantity` (obecny stan plików) nic nie uczy.

### 6.2 Root cause: „Чтение документа..." wisi bardzo długo

Podczas testów natrafiono na **niezacommitowane, ale kompletne** zmiany w drzewie roboczym (nie moje — WIP z wcześniejszej sesji), które już celują dokładnie w ten problem. Komentarz w kodzie mówi wprost:

> „Swapping Qwen Thinking ↔ gpt-oss costs 90+ seconds and can unload a model from an active request."

Czyli: dotychczasowy „szybki sequential switch eyes/brain" (ostatni commit przed tą sesją) nadal kosztuje **90+ sekund** za każdym przełączeniem modelu wizyjnego (OCR) ↔ agentowego na jednym T4 16GB — i to jest główna przyczyna, że „Чтение документа..." wisi. WIP zmienia architekturę na **jeden rezydentny model** (`qwen/qwen3-vl-8b` dla obu ról — OCR i chat/agent), eliminując przełączanie w ogóle: `offerKpModelPipeline.js`, `offerKp.llm.defaults.js`, `offerKp.models.js`, `normalizeWorkspaceLlms.js` (nowy `OFFER_KP_SINGLE_MODEL`), `docker/lmstudio-switch.sh`/`lmstudio-load-brain.sh`, `scripts/deploy-lainey-sync.sh` (dopisuje profil T4 do `.env` produkcji + doinstalowuje `tesseract`/`poppler-utils` jeśli brakuje), plus nowe etapy postępu w UI (`vision-ocr`, `pipeline-agent-load`).

**Dodatkowo znaleziony i naprawiony bug w tym samym WIP** (ujawnił się jako failing test `inquiryTextQuality.test.js` → „accepts a complete structured table"): `assessInquiryTableIntegrity` w `offerKpDocumentIngest.js` sprawdzał obecność jednostki (`кг/шт/м/уп`) w `line.raw` — ale `parseInquiryText` dla tabel strukturalnych **już wycina jednostkę** do osobnego pola `line.unit`, więc ten warunek zawsze failował, nawet dla idealnie czystej tabeli. Efekt: `needsReocr=true` na dobrym tekście → **niepotrzebne** wywołanie kosztownego `enrichDocumentsWithOfferKpOcr` (wizyjny model, kolejne sekundy/dziesiątki sekund) na dokumentach, które wcale tego nie potrzebowały — czyli druga, niezależna przyczyna tego samego objawu.

Naprawa (`offerKpDocumentIngest.js`): zamiast fragile regexu na `raw`, wykrywany jest **over-segmentation** — jeśli `parseInquiryText` zwrócił wyraźnie więcej logicznych linii niż liczba dopasowań słów kluczowych w surowym tekście (`parsed.length > candidateRows * 1.15`), to znak że jeden produkt rozjechał się na kilka wierszy (typowy efekt złego OCR/zawijania) i **żadnemu** wierszowi nie ufamy — niezależnie od tego, czy pojedynczo wygląda kompletnie. Zweryfikowane na obu istniejących golden-testach integralności tabeli (czysty → `usableRows=3/3`, zepsuty → `usableRows=0/3`, oba zgodne z oczekiwaniami testów).

**Logi produkcyjne (Selectel Lainey) nie zostały sprawdzone w tej sesji** — brak połączenia SSH w tym środowisku; root cause ustalono statycznie z komentarzy w kodzie WIP + z failing testu, nie z live logów. Jeśli po wdrożeniu problem nadal występuje, `offerkp logs` / `journalctl -u offer-kp` na Lainey pokaże, czy `OFFER_KP_SINGLE_MODEL` faktycznie wyłączył przełączanie modeli w produkcji.

### 6.3 Co jeszcze zostaje otwarte

- Auto-kalibracja progów golden setu (6.1 pkt 3) — nie zrobiona.
- Realne dane w golden secie (`matched_sku`/`match_type`) — obecnie 0 przykładów ma te kolumny wypełnione; mechanizmy z 6.1 są gotowe, ale nieaktywne, dopóki ktoś nie doda danych.
- Warto dodać licznik/log ile razy `enrichDocumentsWithOfferKpOcr` faktycznie się odpala (przed i po tej poprawce), żeby potwierdzić realny spadek liczby zbędnych wywołań na produkcji — nie zrobione w tej sesji.
