# Glosäventyret – MVP Product Requirements Document

**Version:** 1.0  
**Datum:** 2026-10-14  
**Status:** Ready for implementation (decisions below are MVP defaults)  
**Målgrupp:** Svensktalande barn 10–12 år som lär sig spanska, med förälder som administratör  
**Stack:** Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui + Convex + Vercel  
**Arbetsmetod:** Implementeras etappvis av Codex; varje etapp levereras med tester och dokumenterade avgränsningar.

## 1. Sammanfattning

Bygg en mobil-först-webbapp där en förälder kan importera skolans veckoglosor på under två minuter, och eleven kan öva svenska ↔ spanska genom skrivövningar, flervalsfrågor och flashcards. Appen erbjuder omedelbar positiv feedback, XP, en avslutande utmaning och enkel repetitionsprioritering. Data och progression sparas per elev i Convex.

### Mål

1. 10–30 glosor ska gå att importera, granska och publicera på under 2 minuter från inklistrad text.
2. Eleven ska själv kunna starta och avsluta ett pass i mobilwebbläsaren.
3. Övningarna ska testa återkallning, inte bara igenkänning.
4. Svåra ord ska återkomma oftare utan att eleven fastnar i en oändlig loop.
5. Föräldern ska kunna se progression per lista och ord.
6. Elevens integritet och rollgränser ska fungera även om någon manipulerar klienten.

### Icke-mål i MVP

- AI-bildtolkning, PDF/OCR, genererade exempelmeningar och LLM-rättning.
- Taligenkänning, inspelning, TTS-utöver eventuell senare webbläsarfunktion.
- Klassrum, lärarkonton, offentlig registrering, betallösningar, socialt flöde, topplistor, annonser, pushnotiser eller chatt.
- Offline-first, multi-tenant SaaS, externa API:er för språkdata.
- Automatisk grammatikbedömning bortom explicit angivna svarsalternativ.

## 2. Persona och UX-principer

**Elev:** 10–12 år, gör korta övningar inför veckans glosförhör. Föredrar tydliga val, korta pass och positiv bekräftelse. Gränssnittet ska vara lekfullt men inte småbarnsligt.

**Förälder:** Vill få in veckans lista snabbt och se vilka ord som behöver övas mer. Använder dator eller mobil.

**Principer:**
- Svenska som gränssnittsspråk; spanska i ord och uppgifter.
- 5–10 minuters pass, maximal tydlighet om hur många frågor som återstår.
- Inga skuldbeläggande streak-mekanismer eller beroendeskapande belöningsflöden.
- Färger får inte ensamma bära betydelse; korrekt/inkorrekt visas med text och symbol.
- Touch-ytor minst 44×44 px; tangentbordsvänligt; respekt för `prefers-reduced-motion`.
- Responsiv från 320 px till desktop, stora läsbara typsnitt och tydligt fokus.

## 3. Roller och autentisering – beslutad MVP-modell

**Auth-leverantör:** Clerk med officiellt stöd för Next.js + Convex; använd dokumenterad Clerk–Convex-integration. Välj etablerad auth framför egen JWT-/lösenordslösning.

- `guardian`: vuxen kontoinnehavare, registrerar sig med egen e-post, hanterar gloslistor och ser resultat.
- `learner`: separat inloggad elevidentitet/profil utan krav på barnets e-postadress. Förälder skapar/hanterar denna profil.
- **Viktig implementeringsgrind:** innan etapp 2 verifiera i officiell Clerk-dokumentation och tillämpliga villkor att en administratör kan provisionera en hanterad barnidentitet med lämplig inloggning utan egen e-post. Verifiera stöd för användarnamn/lösenord och eventuella ålders-/kontovillkor. Om detta inte kan uppfyllas: *implementera inte* egen auth eller osäker PIN-lösning. Kör MVP som enbart föräldrainloggad, övervakad enhetsövning tills säker separat elevinloggning har en godkänd design. Dokumentera avvikelsen.
- Ingen självregistrering för barn, ingen insamling av barnets e-post, födelsedatum, skola eller fullständiga namn. Smeknamn räcker.
- Varje Convex-funktion som läser/skriver privat data fastställer server-side användaridentitet och tillhörighet/roll. Klientens `role`, `guardianId` eller `learnerId` får aldrig vara auktoritativa.
- Vid delad enhet: växling av visningsläge får *inte* ge adminbehörighet. En elevsession får aldrig göra adminmutationer; föräldern måste autentiseras i sin egen identitet.
- Max en familj och en elev behöver fungera i UI i MVP, men datamodellen kan stödja fler senare.

## 4. Användarresor

### A. Förälder lägger in veckans glosor

1. Loggar in och öppnar `/admin`.
2. Väljer **Ny gloslista**, anger rubrik (t.ex. `Vecka 42 – Djur`) och valfritt provdatum.
3. Klistrar in text eller laddar upp CSV/TSV med två kolumner.
4. Appen parsar lokalt och visar förhandsgranskning: spanskt uttryck, svensk översättning, rader med fel, varning för dubbletter.
5. Föräldern justerar celler/ord, bekräftar import och väljer **Publicera**.
6. Eleven ser den publicerade listan på startsidan. Utkast får inte synas för eleven.

### B. Eleven övar

1. Loggar in i elevläget och ser **Fortsätt öva**, aktiv lista, lärda ord och dagens rekommenderade pass.
2. Väljer kort (5 frågor) eller normalt (10 frågor) pass och övningsläge.
3. Får en fråga i taget, anger svar, får feedback och går vidare.
4. Får slutskärm med rätt antal, XP och **Öva de svåra igen**.
5. Från senaste passens resultat väljs återkommande svåra ord för kommande övning.

### C. Förälder följer upp

1. Öppnar adminstatistik.
2. Ser glosor i tre grupper: **Behöver övas**, **På väg**, **Sitter bra**.
3. Kan redigera enstaka glosor utan att tidigare svar förstörs.

## 5. Funktionella krav och acceptanskriterier

### FR-01: Listor

- Skapa, döp om, arkivera och publicera listor; status `draft | published | archived`.
- Lista har `title`, valfritt `description`, valfritt `testDate`, ägare och tidsstämplar.
- Ett publicerat objekt visas för elev kopplad till föräldern; ett utkast visas endast för admin.
- Arkivering döljer från aktiva övningar men bevarar historik.
- AC: elev kan inte hämta opublicerade/andra familjers listor genom att ändra ID.

### FR-02: Text-/CSV-import

**Stöd i MVP:**
- Klistra in `el gato - katten`, `el gato;katten`, `el gato<TAB>katten` (en post per rad).
- CSV UTF-8: `spanish,swedish` eller `svenska,spanska`; semikolon-, komma- eller tab-separerad import (detektera header/avgränsare eller låt användaren välja).
- Citatfält och kommatecken i citerade CSV-fält ska stödjas via robust parser (inte `split(',')`).
- För inklistrad text välj den första entydiga avgränsaren; kräv manuell korrigering av tvetydiga rader.
- Visa radräkning och parserfel per rad; inga tysta bortfall.
- Trimma yttre whitespace, normalisera Unicode NFC och ta bort tomma rader; behåll accenter och originaltext.
- Dubblettkontroll i samma lista på normaliserat spanskt uppslagsord + svensk översättning; varna, erbjud hoppa över eller behåll avsiktligt.
- Max 200 ord/import och max 5 000 tecken per textcell; fil max 1 MB. Begränsningar verifieras också på servern.
- Importen är `preview -> confirm`: förhandsgranskning sparar inget. Vid bekräftelse importeras de valda raderna atomärt i en mutation inom praktiska Convex-gränser; dela upp större importer om nödvändigt med explicit failure-rapportering.
- Import ska vara idempotent vid klientretry genom `importRequestId`/dedupe-token.
- AC: 20 blandade, giltiga rader ger 20 korrekt mappade glosor; felaktiga rader blockeras eller väljs bort uttryckligen.

### FR-03: Redigering

- Admin kan ändra text och valfria accepterade svar per glosa.
- Ändring av själva svaret ger ny `contentVersion` och återställer repetitionsstatus för berörda elev–ord-par, utan att radera historiska svar.
- Ord kan inaktiveras (soft-delete) så historik bevaras.
- AC: inaktiverade ord dyker inte upp i nya pass.

### FR-04: Övningslägen

**A. Skriv svaret (viktigast):**
- Standardriktning svenska → spanska; valbar spanska → svenska.
- Ange text, klicka **Rätta** eller Enter; dubbelinlämning förhindras.
- Facit och feedback efter inlämning.
- Fråga med artikel: godkänn endast artikel när glosan kräver det, eller när svaret explicit markerats som alternativ; visa hjälpsam feedback om artikeln saknas.

**B. Flervalsfrågor:**
- 1 facit + upp till 3 unika, trovärdiga distraktorer från samma eller andra tillgängliga listor inom elevens familj.
- Visa flerval bara om minst 3 unika svarsalternativ finns. Annars fallback till skriv/flashcard.
- Slumpa placering rättvist; inga två identiska alternativ efter normalisering.
- Rätt/fel ges direkt; elev kan inte klicka sig till flera poäng för samma fråga.

**C. Flashcards:**
- Visa ena språket, vänd kortet, eleven markerar **Kunde** eller **Behöver öva**.
- Flashcards är självskattade, och det ska vara tydligt i statistik; ger mindre XP än objektivt bedömda frågor.

**Generellt:**
- Passlängd: 5 eller 10 frågor; om färre ord finns är faktiska antal mindre.
- Undvik samma glosa flera gånger i samma pass om unika ord räcker; låt användaren köra om listan.
- Passets data skrivs säkert vid varje besvarad fråga, så refresh inte förlorar allt.
- Frågeriktning kan väljas per pass; default svenska → spanska.
- AC: ett identiskt svar på en fråga registreras högst en gång även vid dubbelklick/retry.

### FR-05: Deterministisk rättning

- Normalisera trim, Unicode NFC, multipla mellanslag, skiftlägeskänslighet av och terminal interpunktion i konfigurerade fall.
- **Behåll diakritiska tecken som betydelsebärande**: `si` är inte automatiskt samma som `sí`; `ano` inte `año`.
- Exakt matchning mot normaliserat facit och föräldragodkända alternativa svar; ingen LLM eller edit-distance-autogodkännande i MVP.
- Visa vid fel: elevens svar, förväntat svar, eventuell lättförståelig instruktion om accent/artikel.
- Stöd en grundform och lista med explicita accepterade varianter; flervalsalternativ hämtas från definierad visningstext.
- All slutlig bedömning görs på servern och facit för skrivuppgift ska inte medfölja klientens förhandsfrågepayload. Undvik att lita på `isCorrect` från klienten.
- För flerval måste alternativen visas på klienten; poäng sätts baserat på servergenererat `correctOptionId` lagrat server-side och elevens inskickade option-ID.
- För flashcards accepteras självbedömt utfall men håll skild result-typ.
- AC: unit-test för accenter, Unicode, whitespace, artiklar och alias.

### FR-06: Smart repetition

**MVP använder enkel, testbar heuristik – inte komplicerad FSRS.**
- `wordProgress`: `attempts`, `correct`, `wrong`, `consecutiveCorrect`, `masteryLevel (0..3)`, `nextReviewAt`, `lastReviewedAt`.
- Nytt ord: nivå 0, omedelbart övningsbart.
- Fel: nivå minskas till max(0, nivå - 1); nytt repetitionsbehov nu/senare i samma dag.
- Rätt svar med skrivövning: öka nivå efter minst två korrekta tillfällen; flerval kräver fler exponeringar; flashcard självskattning ska väga lägst.
- Rekommenderade intervall (konfigurerbara): nivå 0 = inom 1 dag, nivå 1 = 2 dagar, nivå 2 = 4 dagar, nivå 3 = 7 dagar.
- `nextReviewAt` ska baseras på server-tid; vi behöver inte cron-jobs för att markera ord som förfallna.
- Prioritera förfallna/svåra glosor, fyll på med nya ord; exempel 60 % repetition / 40 % nya där det finns underlag.
- Ingen negativ XP eller påtvingade pass.
- AC: samma historik och klocka ger deterministiskt nästa repetitionsdatum; flera snabba identiska submissions ändrar inte nivån flera gånger.

### FR-07: Spelifiering

- XP per **första, giltiga** besvarning: skriv rätt +10, flerval rätt +6, flashcard `Kunde` +2; fel +0.
- Slutskärm med progression och uppmuntrande text oavsett resultat.
- Märken i MVP: `Första passet`, `10 korrekta skrivsvar`, `Klarade veckans utmaning`.
- `Boss challenge`: valbart slutpass med upp till 10 blandade frågor ur publicerad lista, minst hälften skrivfrågor; märket delas ut vid minst 80 % rätt första gången ett försök uppfyller målet. Flervalsfallback om lista saknar distraktorer.
- Separata resultat för kunskap (mastery) och spelpoäng (XP). XP är aldrig facit på verklig kunskap.
- Ingen publik ranking eller påtryckande streak i MVP.
- AC: genomspelning/replay/idempotent fråga kan inte dubbla XP eller märken.

### FR-08: Statistik

**Elev:** aktiv lista, antal ord, senaste pass, egna XP/märken, antal ord som behöver övas.

**Admin:** per lista: antal aktiva ord, antal besvarade, andel korrekta svar i senaste pass, nivågrupper per ord, senast övat.

- Presentera inte statistisk precision från enstaka flashcard-bedömningar.
- Övriga elevers data är aldrig tillgänglig för eleven.
- AC: resultat visar korrekta tal efter avslutat pass och uppdateras reaktivt.

## 6. UI, sidor och komponenter

| Route | Behörighet | Funktion |
|---|---|---|
| `/` | Publik eller omdirigering | Appintro + inloggning, ingen privat data |
| `/app` | Elev | Startsida |
| `/app/lists/[listId]` | Elev | Lista + välj övning |
| `/app/practice/[sessionId]` | Elev | En fråga i taget |
| `/app/results/[sessionId]` | Elev | Resultat |
| `/app/progress` | Elev | XP, märken, repetition |
| `/admin` | Förälder | Översikt |
| `/admin/lists/new` | Förälder | Skapa/importera |
| `/admin/lists/[listId]` | Förälder | Redigera/publicera |
| `/admin/progress` | Förälder | Statistik |

Komponenter: `VocabularyImport`, `ImportPreviewTable`, `VocabularyEditor`, `PracticeQuestion`, `WrittenAnswer`, `MultipleChoice`, `Flashcard`, `ProgressBar`, `AnswerFeedback`, `SessionSummary`, `BadgeShelf`, `WordMasteryList`.

States: loading, empty, offline/reconnect, fel och success ska ha begripliga texter. Visa tomt läge **Inga glosor ännu** med tydlig väg vidare. Animationer max cirka 300 ms och valbara via reduced-motion.

## 7. Convex – datamodell

Föreslagna tabeller (använd explicita `v`-validators i `convex/schema.ts`):

### `users`
- `authSubject: string` (unik via index)
- `role: 'guardian' | 'learner'`
- `guardianId?: Id<'users'>` (för elev)
- `nickname: string` (inga onödiga identifierare)
- `createdAt: number`
- Index: `by_auth_subject`, `by_guardian`

### `vocabularyLists`
- `guardianId: Id<'users'>`
- `title: string`, `description?: string`, `testDate?: string` (`YYYY-MM-DD`)
- `status: 'draft' | 'published' | 'archived'`
- `createdAt: number`, `updatedAt: number`, `publishedAt?: number`
- Index: `by_guardian_status`

### `words`
- `listId: Id<'vocabularyLists'>`, `guardianId: Id<'users'>`
- `spanish: string`, `swedish: string`
- `acceptedSpanish: string[]`, `acceptedSwedish: string[]`
- `contentVersion: number`, `sortOrder: number`
- `isActive: boolean`, `createdAt: number`, `updatedAt: number`
- Index: `by_list_active` / `by_list_order`

### `practiceSessions`
- `learnerId: Id<'users'>`, `listId: Id<'vocabularyLists'>`
- `mode: 'written' | 'multiple_choice' | 'flashcard' | 'mixed_boss'`
- `direction: 'sv_to_es' | 'es_to_sv'`
- `status: 'active' | 'completed' | 'abandoned'`
- `questionCount: number`, `currentIndex: number`, `correctCount: number`, `xpEarned: number`
- `createdAt: number`, `completedAt?: number`
- `questionPlan`: servergenererade snapshots per fråga (wordId, contentVersion, prompt, korrekt svar/ID, optioner vid flerval). **Ska bara läsas via interna funktioner och reduceras till en publik vy utan facit.**
- Index: `by_learner_created_at`, `by_learner_status`

### `practiceAnswers`
- `sessionId: Id<'practiceSessions'>`, `learnerId: Id<'users'>`
- `questionIndex: number`, `wordId: Id<'words'>`, `contentVersion: number`
- `mode`, `direction`, `submittedAnswer?: string`, `selectedOptionId?: string`, `selfRating?: 'known' | 'again'`
- `isCorrect?: boolean`, `xpAwarded: number`, `createdAt: number`
- Index: `by_session_question` (unikhet säkras i mutation med transaktionskontroll), `by_learner_created_at`

### `wordProgress`
- `learnerId: Id<'users'>`, `wordId: Id<'words'>`, `contentVersion: number`
- `attempts: number`, `correct: number`, `wrong: number`, `consecutiveCorrect: number`
- `masteryLevel: number`, `nextReviewAt: number`, `lastReviewedAt?: number`
- Index: `by_learner_word` (logisk unikhet), `by_learner_next_review`

### `achievements`
- `learnerId: Id<'users'>`, `code: string`, `earnedAt: number`
- Index: `by_learner_code` (logisk unikhet)

### `importBatches`
- `guardianId`, `listId`, `requestId`, `importedCount`, `createdAt`
- Index: `by_guardian_request` för idempotens.

**Schema-notering:** Convex unika index garanterar inte automatiskt SQL-liknande UNIQUE; genomför explicit check-and-write i en atomär mutation för semantiska unika nycklar. Dela upp sessioners fråga-snapshots i egen `practiceQuestions`-tabell om payloadstorlek eller sekretess motiverar det. Exponera aldrig `questionPlan` från publika queries.

## 8. Backend-API (föreslagen modulstruktur)

- `convex/users.ts`: `getCurrentUser`, intern profilprovisionering och behörighetsuppslag.
- `convex/lists.ts`: `listMine`, `create`, `update`, `publish`, `archive`, `listPublishedForLearner`.
- `convex/words.ts`: `listForAdmin`, `updateWord`, `deactivateWord`.
- `convex/imports.ts`: `commitPreviewImport` (servervalidering och idempotens).
- `convex/practice.ts`: `startSession`, `getCurrentQuestion` (**sanitized**), `submitAnswer`, `completeSession`, `getResults`.
- `convex/progress.ts`: `myOverview`, `guardianLearnerOverview`, `dueWords`.
- `convex/achievements.ts`: internt, tilldela märken efter uppfyllda kriterier.
- `lib/vocabulary/parser.ts`: ren parser, grundligt unit-testad.
- `lib/vocabulary/normalize.ts`: normalisering och rättningsregler som återanvänds där det går utan att ge klienten rättningsauktoritet.
- `lib/practice/repetition.ts`: rena beräkningsfunktioner med injicerad `now` i tester.

**Viktigt:** använd queries för läsning, mutations för atomära skrivningar, och actions endast när externt I/O behövs (inte i MVP). Gör frågeplanering och rättning server-side, undvik klientens `isCorrect`, `xpEarned` eller `role` som källa till sanning.

## 9. Säkerhet, barnintegritet och datalivscykel

- Föräldrasamtycke och föräldrakontrollerad etablering av elevprofil; ingen självregistrering för barn.
- Bekräfta leverantörsvillkor och tillämpliga barnintegritetskrav före lansering; MVP för familjebruk, inte automatiskt ett godkänt skolverktyg.
- Collect minimum: pseudonym, glosor, svar, progress. Ingen plats, kontaktlista, födelsedatum eller marknadsföringsprofil.
- Inga annonser eller tredjeparts-trackingpixlar. Om analytics används: endast aggregerat och privacy-first, av som default.
- Serverseparerade guardian/learner-roller. Ägarskapscheck i varje query/mutation. Default deny vid saknad auth.
- Strikt validering av längder, filformat, enum, IDs och data relationer. Inga godtyckliga adminfunktioner tillgängliga för elev.
- Importerad text betraktas som data, inte HTML/instruktioner; ingen `dangerouslySetInnerHTML`.
- Brute-force-skydd/rate limits hos authleverantör; begränsa mängden skrivmutationer och inloggningsförsök.
- Föräldern ska kunna exportera glosor och framsteg till JSON och radera elevprofil samt härledda resultat (om inte detta ryms i MVP, markera som blockerande krav för publik lansering; för privat pilot går dokumenterat manuellt raderingsförfarande).
- Separata Convex dev/prod-deployments och Clerk dev/prod-konfigurationer; inga produktionsnycklar i repo. Endast publika Convex URL och Clerk publishable key får exponeras i klient.
- Ingen exponering av hemliga facit i `getCurrentQuestion`, publicerade queries, logs eller serialiserade props; undvik att överrapportera anticheat (lösenordsskydd och auth är viktigare här).
- Dokumentera backup/återställning och ett enkelt manuellt databorttagningsförfarande före familjepilot.

## 10. Icke-funktionella krav

- Responsiv 320–1440 px; Chrome, Safari och moderna mobila webbläsare.
- Målsättning: synlig feedback inom 300 ms vid normalt nät, med tydligt pendingläge; robust mot slow network.
- Inga dubbla sparningar/XP vid retry, refresh, parallella tabs eller snabb dubbelklickning.
- Tillgänglighet: semantiska HTML-element, labels, fokusmarkering, skärmläsarstöd för feedback (`aria-live`), tangentbordsnavigering, reducerad rörelse.
- UI på svenska, orddata med Unicode; datum och tider hanteras robust med svensk tidszon i presentation, UTC epoch för `nextReviewAt`.
- Hantera nätverksbortfall med återförsök och tydligt läge, men lova inte offline-stöd.
- Sätt rimliga backendgränser för antal listor, frågor per pass och importstorlek för att undvika missbruk.

## 11. Teststrategi

**Unit (Vitest):** text/CSV-parser inklusive citattecken, semikolon, TSV, tomrader, dubbletter, Unicode, trasiga rader; normalisering/rättning (`sí/si`, `año/ano`, artiklar, alias); repetition med fryst klocka; XP/märken.

**Convex integration:** behörighetsmatris, publicering, import-idempotens, ägarskapsisolering, frågesessionsstatus, dubbelinlämning, slumpade flervalsalternativ, progressionens versionering. Använd Convex-anpassad testharness, t.ex. `convex-test`, efter versionskontroll.

**E2E (Playwright):** förälder skapar/importerar/publicerar -> elev övar -> resultat -> admin följer framsteg; mobilspecifik vy; session refresh; ogiltigt svar; arkiverad lista; auth åtkomst nekad.

**Säkerhetstester:** elev anropar adminmutation (nekas), elev försöker läsa opublicerad lista (nekas), cross-family object IDs (nekas), manipulerad `xp`, manipulerat facit, dubbla parallella submissions (högst en effekt), HTML/script som importtext (renderas som text), överstor import (nekas).

## 12. Etappvis leverans för Codex

**Arbetsregler för varje etapp:**
1. Läs detta dokument, inventera befintligt repo, kontrollera aktuella officiella API:er. Ändra inte produktionsprojekt.
2. Implementera bara etappens scope och beroenden. Undvik överarkitektur.
3. Kör lint, typecheck, enhetstester och relevanta integrations-/E2E-tester.
4. Redovisa filer, utfört, testresultat, kända begränsningar och nästa etapp i `docs/iterations/ITERATION_N_RESULT.md`.
5. Hitta inte på gröna testresultat eller fungerande konton/nycklar. Markera externa konfigurationer som blockerade där relevant.

### Etapp 0 – Repo, foundation, auth-spike

**Bygg:** Next.js/TypeScript, Tailwind, shadcn/ui, Convex setup (dev), testverktyg, miljöexempel, layouts, svenska UI-texter; dokumentera val av Clerk/Convex-integration och verifiera hanterad elevidentitet enligt §3.

**Definition of Done:** appen startar lokalt; en liten Convex query fungerar; CI-liknande scripts; inga secrets checkas in; auth-beslut och risker dokumenterade.

**Leveransgrind:** separat elevinloggning får inte byggas på osäker custom-token/PIN om leverantören inte stödjer det avsedda flödet.

### Etapp 1 – Admin och glosimport

**Bygg:** guardian auth, schema/roller, skapa/redigera/publicera/arkivera lista, inklistrad text, CSV/TSV, preview, validering, importcommit och dubblettidentifiering.

**DoD:** 20 ord importeras korrekt; felrader kan korrigeras före import; ett retry ger inga dubbletter; elev får inte läsa drafts; parser unit och auth integration godkända.

### Etapp 2 – Elev och övningar

**Bygg:** provisionera elevprofil endast enligt validerat authupplägg, elevens startsida, 5/10 frågor, skrivövning, flerval, flashcards, serverrättning, sessionspersistens, resultat.

**DoD:** komplett elevflöde på mobil; refresh återupptar pågående session; server auktoriserar alla elevaccesser; facit läcker inte före inlämning; dubbelinlämning ger ett svar.

### Etapp 3 – Repetition och statistik

**Bygg:** `wordProgress`, nivåer, schemaläggning vid svar, urval av svåra/förfallna ord, elevöversikt och adminrapport.

**DoD:** testade deterministiska regler, korrekt uppdatering per ord, nivågrupper och datum presenteras begripligt.

### Etapp 4 – Spelifiering och polish

**Bygg:** XP, tre märken, boss challenge, återkoppling, snygg lekfull responsiv design, reduced motion, keyboard/a11y, robusta tom-/felllägen.

**DoD:** XP/märken går inte att dubbla, 80 %-gräns fungerar, mobil-E2E fungerar, manuellt test på telefon.

### Etapp 5 – Familjepilot och release

**Bygg:** miljöseparering och deployment via Vercel/Convex, backup/export/raderingsrutin, säkerhetsregressioner, grundläggande observability utan barnpersondata i loggar.

**DoD:** förälder kan importera riktig veckolista och eleven kan genomföra minst tre övningspass på egen/superviserad enhet enligt authbeslut; alla P0/P1-tester gröna; dokumenterad rollback och backup; kända begränsningar noterade.

## 13. UAT – manuella slutscenarier

1. Förälder importerar 15 ord via klistra-in; tre rader med fel flaggas och korrigeras; 15 ord sparas.
2. Föräldern publicerar listan; eleven ser den, men inte andra utkast.
3. Eleven kör 10 skrivfrågor, svarar delvis rätt och ser facit/XP.
4. Eleven laddar om mitt i passet och kan fortsätta utan förlorade resultat.
5. Eleven kör flerval med unika svar; inga dubletter i alternativen.
6. Eleven övar flashcards och progression skiljer självskattning från automatiskt rättade frågor.
7. Felaktigt ord hamnar i kommande repetitionsurval.
8. Boss challenge klaras vid minst 80 % rätt och ger märke exakt en gång.
9. Föräldern ser vilka ord som är svåra och kan ändra ett ord med korrekt statusversionering.
10. Elevidentitet nekas att redigera, importera, publicera och läsa andra elevers data.

## 14. Prioritering

**P0 (måste fungera för pilot):** säker guardian-auth, fungerande elevåtkomst enligt beslutad modell, listor/import/publicering, skrivövningar, flerval, flashcards, säker serverrättning, sessionspersistens, grundläggande resultat, mobildesign, behörighets- och idempotenttest.

**P1 (MVP som specificerat):** repetitionsprioritering, adminstatistik, XP, tre märken, boss challenge, polish.

**P2 (efter MVP):** fotoinläsning via AI med mänsklig granskning, uppläsning, uttal, meningar, fler barn/familjer, fler språk, FSRS, offline/PWA.

## 15. Risker och beslut

| Risk | Åtgärd |
|---|---|
| Barnkonto/autentisering stöds inte juridiskt eller tekniskt i authleverantören | Etapp 0 verifierar villkor/teknik; tills dess övervakat föräldrakonto utan falskt rollskydd |
| För komplex import tar för mycket tid | Prioritera klistra-in + CSV-preview; ingen AI-import |
| Rättning blir orättvis för artiklar/accenter | Facitvariabler per ord, tydliga instruktioner, unit-tester |
| Eleven kan fuska genom klientpayload | Rätta på servern; hemligt facit; serverger XP |
| Övning upplevs monoton | Blandade lägen, korta pass och positiv feedback |
| SRS blir för avancerad | Enkel deterministisk heuristik, inte FSRS i MVP |
| Data om barn exponeras | Dataminimering, server-side auth och inga tredjepartstrackers |

## 16. Rekommenderad första Codex-prompt

```text
Läs GLOSAVENTYRET_MVP_PRD.md i sin helhet. Vi ska bygga Glosäventyret
stegvis med Next.js App Router, TypeScript, Convex och Tailwind/shadcn.
Börja ENDAST med Etapp 0. Inventera först repot och använd aktuella
officiella integrationsanvisningar. Prioritera särskilt auth-spiken för
separata guardian/learner-identiteter och villkor för barnkonto. Om
separat elevidentitet inte kan göras säkert med vald leverantör,
dokumentera blockeraren och genomför inte osäker egen auth.

Implementera foundation med minsta möjliga kod, installera och konfigurera
testverktyg, lägg in .env.example utan hemligheter. Kör relevanta tester.
Skriv docs/iterations/ITERATION_0_RESULT.md med ändringar, körda tester,
resultat, risker och det som behöver göras manuellt innan Etapp 1.
Ändra inte någon produktionstjänst och påstå inte att externa
integrationer är verifierade om du inte har testat dem.
```

## 17. Referenser (kontrollerade 2026-10-14)

- Convex Next.js Quickstart: https://docs.convex.dev/quickstart/nextjs
- Convex Next.js App Router: https://docs.convex.dev/client/nextjs/app-router/
- Convex + Clerk: https://docs.convex.dev/auth/clerk
- Convex server-side authorization: https://docs.convex.dev/auth/functions-auth
- Convex functions and transactional mutations: https://docs.convex.dev/functions/overview
- Clerk login strategies: https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options

---

**MVP-beslut:** Vi väljer en liten familjeapp före generaliserad plattform, deterministisk rättning före AI och skyddad elevdata före genvägar i auth. Designen ska kännas rolig men hjälpa barnet att faktiskt kunna orden inför glosförhöret.
