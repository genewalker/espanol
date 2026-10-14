# Etapp 4 – Spelifiering och polish

Datum: 2026-10-14. Omfattning: endast Etapp 4 i `GLOSAVENTYRET_MVP_PRD.md`.

## Status

Implementationen är klar lokalt. XP, tre märken och veckans utmaning är byggda
ovanpå de befintliga serverrättade passen. Inga produktionsmiljöer, molnprojekt,
nycklar eller befintliga användarlösenord har ändrats. Etapp 5 har inte påbörjats.
**Etappens DoD är ännu inte helt uppfylld: manuellt test på en fysisk telefon återstår.**
Mobilwebbläsare i Playwright ersätter inte den kontrollen.

## Implementation och beslut

- XP tilldelas på servern vid första giltiga svaret på en fråga: rätt skrivsvar
  10, rätt flerval 6, flashcard `Kunde` 2, andra svar 0. Det faktiska frågeläget
  gäller även när ett flerval faller tillbaka till en skrivfråga.
- Svarets XP lagras i `practiceAnswers.feedback.xpAwarded`, passets i
  `practiceSessions.xpEarned`. Profilen summerar `totalXp` och
  `correctWrittenCount`. Nya fält på befintliga dokument är valfria för en
  kompatibel, additiv schemaändring; frånvaro läses som noll.
- `achievements` har index `by_profile_code`. Tilldelning gör en unik uppslagning
  och eventuell insert i samma mutation som svaret/passets avslutning. Det finns
  högst tre märken per profil. Ingen publik mutation kan tilldela XP eller märken.
- `Första passet`: första pass som slutförs efter införandet, även flashcards.
  `10 korrekta skrivsvar`: tio nya korrekta skrivsvar över ett eller flera pass,
  i båda riktningarna. `Klarade veckans utmaning`: första slutförda utmaning som
  når minst 80 % rätt. Märken behålls efter nya försök, ändrade ord och arkivering.
- `mixed_boss` är ett separat **sessionsläge**. Frågorna är fortfarande skrivfrågor
  eller flerval. Servern väljer upp till tio unika aktiva glosor från en egen
  publicerad lista; `ceil(antal / 2)` är skrivfrågor och resterande flerval.
  Frågetypernas positioner slumpas. Flerval utan tillräckliga distraktorer blir
  skrivfrågor. Riktningen väljs för hela passet precis som i övriga övningar.
- Utmaningen använder hela listan, inte det adaptiva urvalet. Servern kräver
  `count: 10` och `selection: all`; en kort lista begränsar det faktiska antalet.
  Gränsen jämförs utan procentavrundning: `correct * 5 >= total * 4`, total > 0.
- ”Veckans” är namnet på den frivilliga finalövningen inför veckoglosorna, inte
  ett kalenderlås eller en återkommande badgeutdelning. Märket ges en gång per
  profil, inte per lista eller kalendervecka. Inga cron-jobb eller streaks behövs.
- Ett nytt pass ger nya frågetillfällen som kan ge XP; att återanropa en redan
  besvarad fråga, återöppna resultat eller återanvända samma start-ID gör det inte.
  Ett avbrutet pass behåller intjänad XP men ger inget pass-/utmaningsmärke.
- Äldre svar och avslutade pass räknas inte om i efterhand. Ett redan pågående
  äldre pass kan ge XP för återstående, ännu obesvarade frågor. Detta förklaras
  i gränssnittet och README. Ingen backfill eller radering har gjorts.
- Kunskapsprogressionen från Etapp 3 är oförändrad. XP mäter övning, inte
  kunskap; ett svar på en fryst äldre ordversion kan ge XP men uppdaterar inte
  den nya ordversionens kunskapsnivå.

## Gränssnitt och tillgänglighet

XP och märken visas på övningsstart, resultat och Dina framsteg. Märken har
text för intjänat/återstående, och skrivmärket visar antal av tio. Resultatet
visar passets XP, uppmuntran även vid fel/avbrott och utmaningens utfall.
Arkiverade listor har ett förklarande tomläge i resultatet och erbjuder inte
längre en övningslänk som leder till en otillgänglig lista.

Grön äventyrspanel, gul XP-/märkesyta och violett utmaningsruta följer befintlig
krämvit grund. Märken använder enkla dekorativa symboler och begriplig text;
ingen information kräver färgseende. Layouten staplas på mobil. Formulär,
knappar och länkar behåller minst 44 px mål. Fokusmarkeringar omfattar även
`summary` och programmatiskt fokuserade fråge-/feedbackytor. Återkopplingens
enda animation är 180 ms och stängs av vid `prefers-reduced-motion: reduce`.
Inga nya paket, typsnitt, bildtjänster eller trackers har lagts till.

## Säkerhet och dataintegritet

Befintlig Convex Auth och PRD:ns övervakade föräldramodell används oförändrade.
Övningsprofilen är ingen separat elevidentitet; förälderns närvaro krävs.
Nya läsningar går genom `guardianQuery`; svar och avslut genom befintliga
`practiceMutation`, som kontrollerar auth-session, roll, profil och ägarskap.
Klienten får inte välja profil, XP, korrekthetsflagga eller märke.

Svarets dubblettkontroll ligger före alla belöningsskrivningar. Svar,
kunskapsprogression, XP-räknare och eventuellt skrivmärke sparas i samma
Convex-transaktion. Passmärken sparas tillsammans med status `completed`.
Vid parallella anrop skyddar Convex transaktioner och indexläsningar mot
förlorade uppdateringar/dubbla inserts. `rewards.mine` läser enbart egen profil
och högst tre märken; inga obegränsade tabellskanningar har tillkommit.

Granskning genomförd med `convex-expert`, `convex-reviewer`, React-kvalitetslistan
samt hela flödet webbläsare → server → data → återvisning. Installerad Next.js
16.4-dokumentation om App Router-sidor lästes före ändring. Transaktionsupplägget
kontrollerades mot [Convex officiella mutationsdokumentation](https://docs.convex.dev/functions/mutation-functions).

## Tester och resultat

| Kontroll | Resultat |
|---|---|
| `npm run check` | Godkänt: ESLint, Next/Convex TypeScript, 124 tester i 10 filer, lokal produktionsbuild |
| Lokal Convex codegen/upload | Godkänt via `localEnvironment()`; additivt schema och nya funktioner accepterades |
| Nya belönings-E2E | 4/4 godkända i Chromium och mobil WebKit |
| Hela E2E-sviten efter CSS-omstart | 48/48 godkända: 24 Chromium + 24 mobil WebKit, cirka 1,7 minuter |
| Slutlig kontroll av nya stilar | 4/4 belönings-E2E omkörda med explicit kontroll av beräknad CSS; mobilbild granskad |
| `git diff --check` | Godkänt |
| Manuell fysisk telefon | Inte genomförd |

De 23 nya unit-/backendfallen omfattar rätt XP per läge, noll vid fel,
flervalsfallback, parallella identiska svar och avslut, återanrop efter avslut,
klientförfalskade fält, fel frågeordning, tio skrivsvar över flera pass,
7/10 respektive 8/10, lyckat nytt försök, avbrott, start-ID/urval,
ägarskap/utloggad session/elevroll, äldre dokument utan XP samt ordändring och
arkivering. Planering testas för 0/1/2/3/5/9/10/15 tillgängliga ord med
kontrollerad slump, unikhet och minst hälften skrivfrågor. Kortare pass använder
exakt 80 %-tröskel, t.ex. kräver tre frågor tre rätt och fem frågor fyra rätt.

Nya E2E går genom riktig lokal autentisering, startformulär, blandade frågor,
serverrättning, databas, resultat, framsteg och övningsstart. De kontrollerar
återöppning utan extra XP, märke exakt en gång, misslyckat följt av lyckat försök,
arkivering, tangentbord, fokus, reduced motion, 320 px utan sidledes overflow,
axe utan rapporterade överträdelser och inga fångade sidfel i huvudflödet.
Övriga regressionstester täcker auth, import, alla övningslägen och repetition.

Testerna använder nya syntetiska vuxenkonton under `example.test` och lokala
listor. Testdata stannar i lokal databas. Inga autentiseringsspår, videor eller
hemligheter sparas i testartefakter; visuella bilder visar endast syntetisk
övningsdata efter inloggning.

## Fynd och begränsningar

- Tailwind/Turbopack-devservern behöll initialt gammal CSS. Det upptäcktes vid
  visuell granskning trots gröna funktionstester. Endast lokala Next-servern
  startades om; inga auth- eller backendinställningar ändrades. Därefter
  verifierades de nya färgerna även med `getComputedStyle`-assertioner. Slutlig
  mobilbild `/tmp/glosaventyret-iteration4-final-mobile-webkit.png` granskades:
  gröna/gula paneler, intjänade och återstående märken samt mobilstapling syns.
- Fysisk telefon är kvar som manuell DoD-punkt. Nuvarande lokala loopback-URL:er
  (`127.0.0.1`) kan inte användas direkt från en telefon. En separat, avgränsad
  utvecklingskonfiguration för både Next, Convex-URL och auth-origin behöver
  sättas upp och verifieras innan telefonen ansluts. Inga portar/tunnlar eller
  produktionsmiljöer har öppnats som del av denna etapp.
- E2E:s iPhone 13/WebKit är emulering; det verifierar inte fysisk skärmtangentbord,
  touchkänsla, riktiga nätverksbyten eller prestanda på telefon.
- Befintliga begränsningar kring separat elevinloggning, onboarding och e-post
  från tidigare etapper kvarstår. Inga beroenden ändrades; tidigare rapporterade
  utvecklingsberoendesårbarheter är inte omtestade/åtgärdade i denna etapp.

## Manuell acceptans före stängning

När en säker utvecklingsanslutning till telefonen finns: logga in som förälder,
öppna övningsvyn tillsammans, prova skriv-/flervalsfrågor i utmaningen, ladda om
mitt i ett pass, kontrollera XP/märken på resultat och framsteg, och prova
reducerad rörelse. Kontrollera särskilt virtuellt tangentbord, synliga
tryckytor/fokus och att layouten inte kräver sidledsskroll. Dokumentera telefon,
OS/webbläsare och resultat här. Fortsätt inte till Etapp 5 utan separat beslut.
