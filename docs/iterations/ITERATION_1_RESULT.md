# Etapp 1 – Admin och glosimport

Datum: 2026-10-14. Status: **Etapp 1 implementerad och verifierad lokalt.**
Arbetet stannar här. Etapp 2, elevinloggning och övningar är inte implementerade.
Ingen produktionsmiljö eller molndeployment har ändrats.

## Underlag och avgränsning

Utgångspunkt är hela `GLOSAVENTYRET_MVP_PRD.md`, särskilt FR-01–03,
arkitektur-/säkerhetskraven och Etapp 1:s DoD. Beställarens tidigare beslut
**”använd convex auth”** gäller fortsatt. PRD:n och Etapp 0-rapporten är
oförändrade. Den senare är historik, inte beskrivning av dagens funktionsomfång.

Föräldrar använder det befintliga slutna lokala inloggningsflödet. Alla nya
funktioner auktoriseras i backend. Separata elevsessioner används bara som
syntetiska testfixturer för behörighetsmatrisen. Det finns inga elevkonton,
elevlösenord, elevövningar eller elevprovisionering i användargränssnittet.

## Implementation

| Område | Resultat |
| --- | --- |
| `/admin` | Reaktiv översikt över egna listor med status, provdatum, beskrivning och antal aktiva ord |
| `/admin/lists/new` | Rubrik, beskrivning, provdatum, inklistrad text eller lokal UTF-8-fil; granskning före import |
| `/admin/lists/[listId]` | Redigera metadata/ord/alternativa svar, importera fler ord, publicera, återgå till utkast, arkivera och återställa |
| `src/lib/vocabulary/` | Gemensam ren TypeScript-parser och validering för webbläsare och Convex |
| `src/components/admin/` | Svenskt mobilanpassat UI, fel per rad, tydliga dubblettval och återförsök |
| `convex/lib/authorization.ts` | Gemensamma `guardianQuery`/`guardianMutation` via `convex-helpers`; kontroll av signerad identitet, session, lagrad roll och ägarskap |
| `convex/schema.ts` | `vocabularyLists`, `words`, `importBatches`, med index för ägare/status, lista/sortering, lista/aktivitet och ägare/import-ID |
| `convex/lists.ts` | Metadata, statusövergångar, tomma utkast och familjebegränsad läsning av publicerad metadata för elevroll |
| `convex/words.ts` | Svar/alternativ, optimistisk versionskontroll, `contentVersion` och inaktivering utan radering |
| `convex/imports.ts` | Atomär import, ny serverparsning, validering, ägarskap, dubblettbeslut och idempotens |
| Dokumentation | Uppdaterad README och `docs/examples/glosor.csv` med 20 användbara glosor |

Nya beroenden: Papa Parse 5.7.0, typer 5.5.2, convex-helpers 0.1.128 och
@noble/hashes 2.4.0. Hashbiblioteket används enbart för importens
innehållsfingeravtryck, aldrig för egen authkryptografi.
`package-lock.json` och befintlig `pnpm-lock.yaml` är uppdaterade.
Verifieringen och CI använder npm; befintlig pnpm-workspace-konfiguration
har lämnats oförändrad.

## Importens beteende

1. Klistra in text eller läs en fil i webbläsaren. Filen lagras inte i någon
   filstorage. UTF-8 avkodas strikt; ogiltig kodning och filer över 1 MB nekas.
2. Text stöder blandade radavgränsare: ` - `, semikolon och tab.
   Tvetydiga/felaktiga rader kräver rättelse och uttrycklig bekräftelse,
   eller att raden väljs bort. Originalkällan finns kvar i textfältet.
3. Papa Parse hanterar CSV/TSV, citat, escaped citat, kommatecken i citerade
   fält och flerradiga fält. Avgränsare och språkordning kan detekteras eller
   väljas manuellt. Svenska/engelska rubriker och omvänd kolumnordning stöds.
4. Yttre whitespace trimmas och text normaliseras till NFC. Accenter och
   textinnehåll bevaras; ingen automatisk språklig korrigering görs.
   Tomma rader tas bort, men CSV-poster med två tomma fält behålls som fel.
5. Varje post har radnummer och redigerbara språkfält. CSV-numret avser
   logisk post, inte fysisk textrad när ett citerat fält innehåller radbrytning.
   Inget sparas under förhandsgranskningen.
6. Dubbletter jämförs som spanskt + svenskt ordpar, med NFC, trimning,
   gemener och hopslagna whitespace. Accenter är betydelsebärande.
   Kontroll sker mot både granskningen och listans befintliga, även inaktiva,
   ord. Användaren väljer bort raden eller bekräftar att dubbletten ska behållas.
7. Bekräftelse skickar källtext, parserval, alla granskade poster och ett UUID.
   Servern parsar källan igen och kontrollerar att varje post finns kvar som
   vald eller uttryckligen bortvald. Valda fält och dubbletter valideras på nytt.
8. Lista, ord, räknare och importkvitto skrivs i en enda Convex-mutation.
   Fel ger ingen delvis sparad import. En ny lista är alltid ett utkast.

Importkvittot är indexerat på **autentiserad förälder + requestId** och sparar
SHA-256-fingeravtryck av begäran. Samma begäran ger samma resultat även efter
parallella försök. Samma ID med ändrat innehåll nekas. Convex transaktioner
och konfliktomkörning skyddar även samtidiga importer och kvotkontroller.
Källtexten sparas inte i databasen eller applikationsloggar.

Klienten blockerar dubbelklick och behåller samma begäran/ID vid återförsök.
Efter ett misslyckat sparförsök är granskningen låst; **Försök importera igen**
skickar samma payload. För ändrat innehåll öppnas en ny granskning efter att
listöversikten kontrollerats. Granskningen överlever inte omladdning eller
stängd flik; detta beskrivs i README. Ingen lokal kopia av ord eller auth
läggs i localStorage.

## Säkerhet, gränser och versionering

- Privata sidor kontrollerar föräldrainloggning på servern. Backend hämtar
  användare/session från Convex Auth och litar inte på klientens roll/familje-ID.
- Varje adminquery och mutation använder samma rollkontroll. List-/ord-ID
  från annan familj nekas med samma `NOT_FOUND` som ett saknat objekt.
- Elevqueries ger enbart publicerad metadata inom den kopplade familjen,
  utan ord, alternativa svar eller authuppgifter. Utkast och arkiv nekas.
  Dessa queries införs nu för att testa Etapp 1:s behörighetskrav.
- Publicering kräver minst ett aktivt ord. Inaktivering av sista aktiva ordet
  gör en publicerad lista till utkast. Arkivering bevarar ord och versioner.
  Arkiverade listors ord kan inte ändras/importeras innan listan återställts.
- Svar och accepterade alternativ versionshanteras. Samma innehåll ger ingen
  ny version; en innehållsändring ökar `contentVersion`. En gammal
  `expectedVersion` nekas så att en parallell ordändring inte skrivs över.
  Listmetadata har enklare senaste-skrivning-vinner-beteende.
- Ord inaktiveras i stället för att raderas. Progression och historiska svar
  finns ännu inte. Etapp 3 måste koppla versionsbyten till återställd
  repetitionsstatus utan att radera svarshistorik.
- Alla publika funktioner har args- och returvalidatorer. Databasläsningar är
  indexerade och begränsade; inga obegränsade produktions-`collect()` används.
- Text renderas via Reacts escaping. HTML/script från import blir synlig text.

| Gräns | Serverkontroll |
| --- | --- |
| Poster per import | 200, inklusive bortvalda poster |
| Tecken per språkfält/alternativ | 5 000 |
| UTF-8-källa/fil | 1 048 576 byte |
| Serialiserade granskningsrader | 1 048 576 byte, extra skydd för redigerad payload |
| Listor per familj | 50, inklusive arkiverade |
| Ord per lista | 500, inklusive inaktiva |
| Samlat ord-/alternativinnehåll per lista | 2 097 152 byte |
| Alternativa svar | 10 per språk och ord |
| Rubrik/beskrivning | 120/1 000 tecken |

Extra kvoter gör administrationen förutsägbar och begränsar läsningar och
transaktioner. Vid en kvotgräns ges ett fel och ingen partiell import.
Det finns ingen automatisk batchuppdelning eller automatisk permanent radering.

## Tester och resultat

Körmiljö: Node 22.22.0, lokal Next.js och lokal Convex på loopback.

| Kontroll | Resultat |
| --- | --- |
| `npm run check` | Godkänd: ESLint, Next-routetyper, frontend/backend-TypeScript, Vitest och optimerad lokal Next-build |
| Vitest / convex-test | **51 godkända tester** i fyra filer, inklusive tidigare authregressioner |
| `npm run test:e2e` | **22 godkända tester** efter sista CSS-justeringen: Chromium och WebKit med iPhone 13-profil, inklusive 200 poster i det riktiga API-testet |
| Tillgänglighet | Inga axe-fynd i testade vyer; 320 px utan horisontell overflow; kontroller minst 44 px; visuell kontroll av mobil importvy |
| `npm audit --omit=dev` | **0 sårbarheter** |
| pnpm-låsfil | `pnpm install --lockfile-only --ignore-scripts` godkänd; ingen ny pnpm-installation av node_modules gjordes |

Verifierade flöden:

- 20 blandade textposter, tre felrader som korrigeras före import, ingen lista
  i databasen under preview och exakt 20 korrekt mappade ord efter commit.
- CSV-fil med omvända rubriker, BOM, UTF-8/ñ, citerat kommatecken och
  dubblettval. En senare import kontrolleras mot redan sparade ord.
- Både sekventiella och samtidiga återförsök, i convex-test och mot riktig
  lokal Convex. Den slutliga API-körningen importerade 200 poster med exakt
  en effekt från parallella anrop.
- Elev, anonym och annan familj nekas varje adminoperation. Eleven nekas
  egna utkast/arkiv och andra familjers publicerade listor.
- Ogiltiga/överstora importer, borttagna källrader och uppnådda kvoter ger
  inga ofullständiga listor, ord eller importkvitton.
- Metadata, alternativa svar, versionskonflikt, publicering, inaktivering,
  återaktivering, arkivering, omladdning och återställning.
- Importerad scripttext körs inte. Grundtesterna för HttpOnly-cookies,
  utloggning, nekad registrering, cross-site auth-POST och rate limit är gröna.

E2E-flödet för 20 ord inklusive rättelser/redigering/publicering tog några
sekunder automatiserat och klarade testgränsen två minuter. Detta ersätter
inte en tidsmätning med en faktisk förälder. Mobil WebKit är emulering,
inte en verifiering på fysisk telefon.

Under verifieringen rättades följande fynd: CSV:s greedy-blankradsläge kunde
utelämna poster med två tomma fält; det ersattes med begränsad postvis
parsning. Granskningsfältens etiketter fick explicita ID-kopplingar så att
deras text inte blandas med textarea-innehåll vid label-uppslag.
Den visuella kontrollen hittade dessutom att den redan körande devservern
serverade gammal CSS efter beroende-/stiländringarna, trots korrekt CSS i
produktionsbygget. Lokal frontend startades om, korrekt layout verifierades
och hela E2E-sviten kördes om. Mobiltestet kontrollerar nu även kontrollernas
minimihöjd, eftersom axe/overflow ensamt inte upptäckte den gamla stilmallen.
Den extra kontrollen hittade Safaris native-select som åsidosatte minsta
höjden. Rullistorna fick `appearance: none` med synlig pil och minst 44 px,
med bibehållen native-semantik och tangentbordsstyrning.

## Begränsningar och nästa etapp

1. **Publik föräldraonboarding är fortfarande blockerad.** Etapp 0 pekade ut
   verifierad vuxenetablering och återställning som fortsatt arbete. Här
   används det slutna lokala operatörsflödet; ingen e-postleverantör eller
   verifierad avsändare är konfigurerad. Självregistrering, e-postverifiering
   och reset är fortsatt stängda. De får inte beskrivas som färdig leverans
   för publik drift. Detta hindrar inte lokal testning av Etapp 1.
2. **Etapp 2 är inte påbörjad.** Beslut och verifiering om separat elevkonto
   utan e-post respektive övervakad föräldrasession återstår enligt
   auth-utredningen. Dagens elev-fixturer är säkerhetstester, inte onboarding.
3. **Convex Auth är fortsatt beta.** Tidigare noterade utvecklingsberoenden
   och pilotfrågor om integritet, backup, radering och återställning kvarstår.
   Ingen moln-/produktionsdrift eller riktig elevdata har använts.
4. **Testdata stannar lokalt.** E2E skapar nya syntetiska vuxenkonton och listor.
   Befintliga användarkonton/listor har inte raderats eller migrerats destruktivt.
5. **Begränsad importstorlek.** Nära 1 MB kan den redigerade granskningens
   serialiserade storlek nå sin extra gräns. Dela då källan i mindre importer.
   Kvoter och felmeddelanden gäller även direkta API-anrop.
6. **CSS-omladdning lokalt.** Den installerade Tailwind/Turbopack-kombinationen
   har behållit äldre CSS efter stiländring i en körande devserver. Omstart
   läser aktuell fil; optimerad build innehåller också korrekt CSS. Workaround
   finns i README. Ingen generell hot-reload-rättning av tredjepartsverktygen
   ingår i denna iteration.

## Verifierade primärkällor

- [Convex mutationer och transaktioner](https://docs.convex.dev/functions/mutation-functions)
- [Convex index](https://docs.convex.dev/database/reading-data/indexes/)
- [convex-test](https://docs.convex.dev/testing/convex-test)
- [Papa Parse-konfiguration och parserfel](https://www.papaparse.com/docs)
- Installerad Next.js-dokumentation för App Router, async `params` och auth,
  enligt repots `AGENTS.md`; installerade typer för `convex-helpers`.

Starta/testa enligt README. Nästa arbetssteg kräver ett nytt beslut att gå
vidare till Etapp 2; denna iteration stannar vid admin och glosimport.
