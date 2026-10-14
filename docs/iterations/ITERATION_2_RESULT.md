# Etapp 2 – Elev och övningar

Datum: 2026-10-14. Status: **Lokalt implementerad och verifierad enligt PRD:ns
reservmodell med övervakad föräldrasession.** Separat elevinloggning är inte
aktiverad. Etapp 3–5 är inte påbörjade. Ingen produktionsmiljö eller
molndeployment har ändrats.

## Underlag och authbeslut

Hela `GLOSAVENTYRET_MVP_PRD.md` lästes igen, tillsammans med tidigare
iterationsresultat och befintlig kod. Beställarens beslut att använda
**Convex Auth** gäller fortsatt; ingen Clerk-integration eller egen
lösenords-/JWT-/PIN-lösning har lagts till.

Den officiella Convex Auth-dokumentationen beskriver användarnamn som möjlig
kontonyckel, liksom API:er för etablering, verifiering av credentials,
återställning och återkallning av sessioner. Det innebär tekniskt stöd för
byggstenarna, men är inte i sig en validerad helhetslösning för barnkonto.
Se [serverreferensen](https://labs.convex.dev/auth/api_reference/server) och
[lösenordskonfigurationen](https://labs.convex.dev/auth/config/passwords).

Leverantörens aktuella policy-/villkorstexter kontrollerades även i sidornas
inbäddade `srcDoc`: integritetspolicyn §10 berör barn under 13; villkoren
§5.1–5.2 lägger ansvar för kunddata, samtycken och särskilda krav på kunden.
Det ger inte ett generellt godkännande för denna apps separata barninloggning.
Den tidigare grinden för godkänd provisionering, återställning och
barnintegritetsbedömning är därför fortfarande öppen. Se
[Convex Privacy Policy](https://www.convex.dev/legal/privacy) och
[Terms of Service](https://www.convex.dev/legal/tos).

**Beslut för denna iteration:** använd PRD §3:s uttryckliga reservmodell.
Föräldern loggar in med befintlig Convex Auth och är närvarande vid övning.
En separat, minimal **övningsprofil** innehåller bara smeknamn och familjekoppling.
Den är ingen authidentitet: inget barnkonto, lösenord, e-post, födelsedatum,
fullständigt namn eller skola skapas. Ingen automatisk koppling till authkonton
görs. Ett påhittat smeknamn uppmanas i UI.

Alla övningssidor visar att förälderns session fortfarande ger adminåtkomst.
Att gå från `/admin` till `/app` ändrar ingen roll. En lagrad `learner`-roll
nekas de nya övnings-API:erna tills separat elevinloggning har validerats.
Förälderns administrativa åtkomst till egna glosor finns förstås kvar;
sanerade frågepayloads är ingen fusksäkerhetsgräns mot den inloggade föräldern.

## Levererat

| Del | Implementation |
| --- | --- |
| `/app` | Smeknamnsprofil, publicerade familjelistor, fortsätt pågående pass och senaste fem passens vy (pågående pass visas separat) |
| `/app/lists/[listId]` | Välj 5/10 frågor, riktning och skrivövning/flerval/flashcards |
| `/app/practice/[sessionId]` | En fråga åt gången, serverfeedback, explicit nästa-fråga, sparat läge, avsluta i förtid |
| `/app/results/[sessionId]` | Antal rätt av rättade frågor, separata självskattningar, genomgång av sparade svar och länk till nytt pass |
| `src/components/practice/` | Start, pass, feedback, profil och resultat med svensk text, tangentbordsstöd och anslutnings-/felläge |
| `src/lib/vocabulary/normalize.ts` | Ren deterministisk normalisering och rättning med accent-/artikelråd |
| `convex/practice.ts` | Profil, publicerad metadata, start, sanerad fråga, vänd kort, skicka svar, avancera, avbryt och resultat |
| `convex/lib/practiceAccess.ts` | Gemensam serverkontroll av auth, föräldraroll, övningsprofil och sessionens ägarskap |
| `convex/lib/practicePlan.ts` | Serverplanering, unikt ordurval, shuffle, svarsalternativ och fallback |
| `convex/lib/practiceModel.ts`, schema | Validerade profiler, sessioner, separata frågesnapshots och svar |
| README/admin/intro | Aktuell status, länk **Öva tillsammans** och instruktioner för testning |

Inga nya paket behövdes. Befintlig Next.js/TypeScript, Convex Auth, Convex,
convex-helpers, Tailwind och shadcn används. Inga externa språk-/AI-tjänster,
jobs eller ytterligare backendtjänster har införts.

## Datamodell och familjegräns

Nya tabeller är additiva; befintliga listor, ord och authkonton har inte
raderats eller ändrats genom någon migration.

- `learnerProfiles`: `guardianId`, `nickname`, `createdAt`. Index `by_guardian`.
  Atomär check-and-write ger högst en profil per förälder i denna version.
- `practiceSessions`: profil/förälder/lista, listtitel som snapshot, läge,
  riktning, status, antal frågor, aktuell fråga, separata resultaträknare,
  start-ID och tider. Index på profil/status, profil/tid och profil/start-ID.
- `practiceQuestions`: en snapshot per fråga med ord-ID, `contentVersion`,
  prompt, facit, godkända alternativ och eventuell privat korrekt option-ID.
  Index på session/frågenummer. Separata dokument undviker en stor
  `questionPlan` i sessionsdokumentet.
- `practiceAnswers`: session/profil/frågenummer, ordversion, läge/riktning,
  inlämning och serverproducerad feedback. Index på session/frågenummer;
  logisk unikhet säkerställs i samma transaktion som resultaträknarna.

PRD:ns föreslagna `learnerId: Id<users>` ersätts här av
`profileId: Id<learnerProfiles>`, eftersom reservmodellen inte har en
autentiserad barnanvändare. En framtida separat identitet behöver en uttrycklig
serverkontrollerad koppling till profilen; inga låtsaskonton skapas i `users`.

Alla privata funktioner använder befintlig identitets-/sessionskontroll samt
lagrad roll. Profil och förälder härleds på servern. Klienten får inte välja
`guardianId`, `profileId`, `learnerId`, korrekt utfall eller poäng.
Sessionsåtkomst verifierar både profil och förälder. Databasläsningar är
indexerade och begränsade; inga obegränsade `collect()` används i produktkod.

## Övningsregler

**Skrivfrågor:** trimning, NFC, gemener, hopslagna whitespace och borttagning
av avslutande `.`, `!`, `?`, `…`. Accenter/ñ och intern interpunktion bevaras.
Rätt svar kräver exakt normaliserad matchning mot huvudsvaret eller ett
föräldragodkänt alternativ. `si/sí` och `ano/año` skiljs åt. Saknad artikel
godkänns endast när ett explicit alternativ tillåter det. Accent-/artikelråd
visas vid relevant fel; inga stavfel autogodkänns. Rättning sker på servern.

**Flerval:** facit plus upp till tre unika distraktorer från den aktuella
publicerade listan. Distraktorer som är accepterade alias eller har samma
normaliserade prompt utesluts. Minst tre alternativ krävs, annars blir just
den frågan en skrivfråga. Alternativen blandas med Fisher–Yates och Convexs
serverstyrda `Math.random`. Option-ID tilldelas **efter** blandning, så ID:t
inte avslöjar rätt svar. Rättning använder privat lagrat `correctOptionId`.

**Flashcards:** förhandsvyn saknar facit. **Vänd kortet** är en separat,
auktoriserad mutation som sparar att kortet vänts och först då visar svaret.
**Kunde**/**Behöver öva** är explicit självskattning; ingen `isCorrect` eller
objektiv korrekt-räknare tilldelas för flashcards.

**Urval:** högst 5/10 unika normaliserade ordpar och inga upprepade ord i samma
pass. En kortare lista ger färre frågor. Urvalet är slumpat; prioritering av
svåra eller förfallna ord hör till Etapp 3.

## Persistens, retry och sekretess

1. Start skapar session och samtliga frågesnapshots atomärt. Samma start-ID
   och samma val ger samma session; ändrade val med samma ID nekas.
2. Varje besvarad fråga sparas atomärt med räknarna. Samma fråga/inlämning
   återger tidigare feedback utan ny effekt. Ett annat svar på redan besvarad
   fråga nekas. Detta gäller även parallella anrop och två flikar.
3. Feedback ligger kvar tills användaren väljer **Nästa fråga**. Omladdning
   återställer prompt, svar/feedback och vändningsläge från servern.
   Oskickad text ligger bara i flikens minne och sparas inte.
4. **Nästa fråga** är också idempotent. Framåthopp och avancering utan svar
   nekas. Efter sista svaret slutför **Visa resultat** passet atomärt.
5. **Avsluta i förtid** behåller redan besvarade frågor och stoppar nya svar.
   Resultatet innehåller inte facit för frågor som aldrig besvarats.
6. Arkiverad/avpublicerad lista blockerar nya frågor och svar i ett aktivt
   pass. Användaren kan avsluta det eller invänta återpublicering. Redan
   sparade resultat och identiska svarsåterförsök är historik och bevaras.
7. Ordtext/alias ändrade efter start påverkar nya pass. Pågående pass rättas
   mot sina snapshots och sparar den ordversion som faktiskt övades.
   Inaktiva ord väljs inte till nya pass.

`getCurrentQuestion` bygger en explicit publik vy: aktuell prompt, läge,
optioner där det behövs, räknare och eventuell redan intjänad feedback.
Den sprider aldrig ett frågedokument och skickar aldrig framtida frågor,
facit/alias till skrivfrågan eller korrekt option-ID. Flashcardfacit visas
bara efter vändning. React renderar indata som text, inte HTML.

Gränser: ett aktivt pass per profil, högst 50 nya pass under rullande 24 timmar,
högst 10 frågor/pass, 5 000 tecken i skrivsvar, 32 tecken i smeknamn och
32 tecken i inskickat option-ID. Alla enum/ID/relationer och gränser valideras
på servern. Tid kommer från backend. Ingen cron behövs.

## Tester och resultat

Verifierat 2026-10-14 med Node 22.22.0, lokal Convex och Next.js på loopback.

| Kontroll | Resultat |
| --- | --- |
| Lokal Convex codegen/push, med `localEnvironment()`-skydd | Godkänd; nya tabeller och funktioner är körda mot riktig lokal backend |
| `npm run check` | Godkänd: ESLint, frontend/backend-TypeScript, Vitest och optimerad lokal Next-build |
| Vitest/convex-test | **77/77 godkända**, sex filer; 26 nya rättnings-/övningstester |
| `npm run test:e2e` | **30/30 godkända**, Chromium och mobil WebKit/iPhone 13; 54 sekunder i slutkörningen |
| `npm audit --omit=dev` | **0 sårbarheter** |
| Tillgänglighet/visuell kontroll | Axe utan fynd i testade vyer, 320 px utan horisontell overflow, 44 px svarsfält, Enter för rättning, mobil övningsvy visuellt kontrollerad |
| `git diff --check` | Godkänd |

Verifierad kedja: förälder publicerar lista → skapar profil → väljer pass →
klient anropar Convex → servern sparar/rättar → reaktiv feedback → resultat.

Enhets-/integrationstester täcker normalisering, accenter, artikel/alias,
alternativens unikhet och olika rätta positioner, fallback, profil-/startretry,
en aktiv session, samtidiga identiska och olika svar, gamla ordversioner,
inaktivering, snapshotsekretess, felaktiga index/alternativ/lägen, förfalskat
`isCorrect`/XP, kvoter, arkivering, avbrott och resultat. Anonym, elevroll och
annan familj nekas samtliga nya privata läsningar/skrivningar. Återkallad
authsession nekas även på övnings-API:et.

E2E kör tio skrivfrågor (nio rätt, ett fel), Enter, omladdning före och efter
svar, hem/fortsätt och slutresultat. Flerval körs i omvänd riktning med fem
frågor, följt av fallback på tvåordlista och artikelråd. Flashcards provas med
omladdning efter vändning, arkivering/avbrott, bevarat delresultat och ett nytt
helt pass med både **Kunde** och **Behöver öva**. Riktig lokal Convex provas
dessutom med parallell start/svar/avancering och främmande familjs sessions-ID.
Alla tidigare auth- och importtester är fortsatt gröna.

Fynd under arbetet: en testfixturs konstanta slumpvärden täckte först bara
tre positioner och kompletterades; unionstyper i testerna fick explicit
lägeskontroll. Safari-testet behövde invänta avslutad navigation till `/app`
innan nästa navigation initierades. Det var ett testlopp, inte en authändring.
Den tidigare dokumenterade CSS-cachebegränsningen hanterades med lokal
frontendomstart före slutverifiering.

## Begränsningar och nästa etapp

- **Ingen separat elevinloggning.** Övning sker med närvarande förälder. Den
  nya profilen är inte ett avskilt konto och ska inte användas som sådant.
- Publik vuxenetablering, e-postverifiering och lösenordsåterställning förblir
  stängda. Det befintliga operatörsflödet är för lokal utveckling.
- Repetitionsstatus, mastery, XP, märken, bossutmaning och adminstatistik
  är inte byggda. Etapp 3 ska använda profilens ID och ordversionerna för
  repetition/statistik; gamla snapshots och svar ska bevaras vid ordändring.
- Självskattning säger inte att eleven har visat objektiv kunskap. Resultat
  håller därför dessa frågor och räknare skilda.
- Ingen offlinefunktion. Pending/återanslutning använder Convex-klienten;
  omladdning och serverretry är verifierade, men ingen omfattande
  nätfel-/latensprovning eller fysisk mobiltest har gjorts. Målet 300 ms
  feedback under verkligt nät är inte en uppmätt garanti.
- Backup, export och selektiv radering inför riktig familjepilot kvarstår
  från tidigare etapper. Raderingsrutinen måste nu även omfatta
  `practiceAnswers`, `practiceQuestions`, `practiceSessions` och
  `learnerProfiles`, utöver familjens tidigare data. Ingen användardata har
  raderats under denna iteration.
- Syntetiska vuxenkonton, profiler och övningspass från tester stannar i lokal
  utvecklingsdatabas. Inga hemligheter eller auth-skärmbilder har lagts i repo.

## Primärkällor

- [Convex Auth serverreferens](https://labs.convex.dev/auth/api_reference/server)
- [Convex Auth Password](https://labs.convex.dev/auth/config/passwords)
- [Convex transaktioner](https://docs.convex.dev/functions/mutation-functions)
- [Convex determinism, tid och slump](https://docs.convex.dev/functions/runtimes#determinism)
- [Convex Privacy Policy](https://www.convex.dev/legal/privacy) och
  [Terms of Service](https://www.convex.dev/legal/tos), inklusive inbäddad text
- Installerad Next.js-dokumentation för App Router och async `params`, enligt
  `AGENTS.md`, samt befintlig Convex-/React-granskningschecklista.

Testa via **Föräldrasidan → Öva tillsammans** enligt README. Arbetet stannar
vid Etapp 2; Etapp 3 kräver nästa instruktion.

## Uppföljning: återinloggning efter ogiltig session (2026-10-14)

Användaren rapporterade `UNAUTHENTICATED` från `lists:listMine` efter försök
att använda tidigare inloggningsuppgifter. Felet kunde reproduceras med ett
syntetiskt konto genom att återkalla sessionen medan föräldrasidan var öppen.
Den signerade JWT:n kan fortfarande godkännas av Convex-klienten trots att
sessionen i `authSessions` är borttagen. Backend avvisade åtkomsten korrekt,
men klientens `Authenticated`-gräns hanterade inte det läget. Även SSR-kontrollen
saknade omdirigering för detta specifika fel. Testet för återhämtning misslyckades
före rättningen.

Ändringar:

- En gemensam `SessionBoundary` och `SignInAgain` hanterar det strukturerade
  `UNAUTHENTICATED`-felet och ger en tydlig väg till ny inloggning. Övriga fel
  går vidare till ordinarie felhantering. Övningsvyns och admins routegränser
  känner också igen sessionsfelet.
- `guardian()` omdirigerar till `/sign-in` när backend avvisar sessionen.
- Länken tillbaka till inloggning gör en full sidnavigering, så att gamla
  Convex-prenumerationer, frågefel och routefel släpps före nästa inloggning.
- Formuläret använder Convex Auths `signOut()` före `signIn()` för att avsluta
  eventuell befintlig session innan de nya uppgifterna skickas. Detta åtgärdar
  också det reproducerade felet vid återinloggning från en redan inloggad flik.
  Ett nytt inloggningsförsök avslutar alltså den tidigare sessionen även om det
  nya lösenordet är fel. Ingen egen token- eller sessionshantering har införts.
- Backendens sessions- och behörighetskontroller är kvar. Inga lösenord har
  återställts och inga produktionsmiljöer har ändrats. Användarens faktiska
  lösenord har inte lästs eller testats.

Regressionstester i `tests/e2e/session-recovery.spec.ts` använder riktiga lokala
sessioner och kontrollerar återkallelse på både `/admin` och `/app`, inloggning
med samma konto efter felet, gammal sessionscookie vid sidladdning och ny
inloggning från en redan inloggad flik. Tokens och lösenord hålls i testprocessens
minne utan spårfiler eller utskrift.

Verifiering: hela `npm run test:e2e` passerar, **38/38** i Chromium och mobil
WebKit, inklusive de åtta nya regressionstesterna. Lint, frontend-/backendtyper,
77 enhets-/backendtester och lokal build passerar också. Den bredare körningen
fångade en Safari-bieffekt av full sidnavigering direkt efter lyckad inloggning;
slutlösningen behåller Next.js-navigation efter inloggning och passerar samma
tester utan att filtrera bort webbläsarfel.
Sessionsbeteendet kontrollerades även mot installerad Convex Auth 0.0.96 och
[Convex Auths dokumentation om sessioner](https://labs.convex.dev/auth/authz).
