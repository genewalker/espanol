# Etapp 5 – Familjepilot och release

Datum: 2026-10-14. PRD:n läst i sin helhet; endast Etapp 5 och dess beroenden.

## Status och ansvar

**Den lokala implementationen och verifieringen är klara. Etappens externa
release/pilot-DoD återstår.** Användaren angav projektet `espanol` och meddelade
att Vercel ligger på ett annat konto samt att användaren själv sköter deployen.
Den anslutna Vercel-arbetsytan kunde inte läsa projektet (404); ingen ny
molnresurs skapades som ersättning. Inga produktionsmiljöer eller verkliga
användarkonton har ändrats eller raderats. Ingen extern backend-/frontenddeploy,
Git-push eller commit har utförts av agenten.

[Release- och driftguiden](../operations/PILOT_RELEASE.md) innehåller konkreta
miljövariabler, kommandon, auth-provisionering, verifiering, backup, radering,
rollback och manuell acceptans för användarens deploy.

## Implementation

### Export och radering

Ny skyddad sida `/admin/data`, länkad från föräldrasidan:

- `convex/data.ts`: `profile`, `exportList`, `beginProfileDeletion`,
  `deleteProfileBatch`. Samtliga har argument-/returvalidators och serverkontroll
  av guardian/session/ägarskap. Ingen klientvald profil eller lista kan ge
  åtkomst till en annan familjs data.
- JSON-export tar en atomär, begränsad snapshot per lista: metadata, aktiva och
  inaktiva glosor, accepterade svar, ordversion/sortering, aktuell ordprogression
  samt profilens totala XP och märken. Även utkast och arkiv kan exporteras.
  Inga auth-tabeller, lösenord, e-post eller dolda frågeplaner ingår. Historiska
  övningssvar ingår inte. Profilens XP är ett totalt värde, inte en summering för
  bara den valda listan. JSON-exporten är inte ett återställningsformat.
- Föräldern måste skriva `RADERA`. Profilen spärras med ett valfritt `deleting`
  fält; övningsmutationer och profiländring blockeras medan raderingen pågår.
- Varje anrop raderar en session med max tio frågor/tio svar, eller max 100
  progressrader, till sist märken/profil. Index används, inga obegränsade läsningar.
- Avbrott lämnar en synlig återupptagningsmöjlighet. Raderingen är inte beroende
  av ett långlivat serverjobb; klienten driver batcherna medan sidan är öppen.
  Dubbla anrop och gammalt profil-ID påverkar inte en ny profil.
- Föräldrakonto och gloslistor behålls. Nedladdade JSON-filer och gamla backups
  hanteras separat enligt driftrutinen. Hela vuxenkontots livscykel ligger utanför
  profilknappen och är fortfarande en begränsning inför publik lansering.

Ändrade stödytor: schema, `practiceAccess`, `saveProfile`, övningsstartens låsta
läge samt adminnavigation. Gamla dokument är kompatibla utan backfill.

### Miljöseparering och deploy

- `.env.pilot.example`: separat konfigurationsmall; `.env.pilot.local` är ignorerad.
- `scripts/pilot-environment.mjs`: matchar deklarerad dev-deployment, båda
  Convex-URL:erna och fast HTTPS-origin. Backend kräver en nyckel med exakt
  `dev:<namn>|`-prefix; prod-, legacy-, previewprojekt- och främmande nycklar nekas.
- `scripts/pilot-backend.mjs`: avgränsade `deploy` och `setup-auth`. Använder
  miljövariabler/stdin, aldrig hemligheter i processargument eller utskrifter.
  Auth-setup bevarar befintligt nyckelpar och avvisar ett ofullständigt par.
  Filen påverkar inte `.env.local` eller den lokala backendens auth.
- `convex/pilot.ts`: intern operatörsprovisionering av vuxenkonto, bunden till
  serverns explicit konfigurerade pilotdeployment. Publik registrering är fortsatt
  avstängd; separat elevinloggning har inte införts. Funktionen kräver operatörens
  åtkomst och går inte att anropa som en publik klient-action.
- `vercel.json` och `scripts/build-pilot.mjs`: endast Preview-byggen, inga
  backendnycklar i frontend, `npm ci` och Next-build. Backend deployas separat så
  frontendbygget inte kan råka skriva till en annan Convex-miljö.
- `.vercelignore` och `.gitignore`: utesluter privata env-filer, lokal databas,
  backups/exporter och testartefakter. Exempelmallar är versionshanterade.

Dessa kontroller validerar angiven konfiguration; Vercel-/Convex-projektets
verkliga miljötyp, åtkomst och auth-origin måste också kontrolleras på rätt konto.
Molnkommandona har inte körts och ingen molnintegration påstås vara verifierad.

### Backup, rollback och observability

- `npm run backup:local` använder det befintliga loopback-/produktionsskyddet och
  Convex ZIP-export med fillagring. Katalog 0700, filer 0600, SHA-256-fil; inga
  råa data/nycklar i logg. Inget laddas upp. Filrättigheter ersätter inte kryptering.
- En full lokal backup har skapats. ZIP CRC, SHA-256, 18 exporterade tabeller och
  nödvändiga auth-/domäntabeller kontrollerades utan att skriva ut innehållet.
- Driftguiden dokumenterar backup inför release och efter pilotdag, sju dagars
  gallring, skyddad separat kopia, schema-/authberoenden, återställning av hela
  snapshoten, raderingsbegäran efter snapshot samt frontend-/backendrollback.
- **Full import/återställning till separat deployment har inte utförts.** Det
  dokumenteras som en kvarstående operatörskontroll, inte som ett godkänt test.
- `/api/health` ger enbart `status: ok` och no-store; Convex har separat
  `health:check`. Liveness ska inte tolkas som verifierad auth/databasåtkomst.
- `src/instrumentation.ts` loggar bara en fast serverfelhändelse, utan att läsa
  felobjekt, request, headers, URL eller context. Convex-klientens konsollogger
  är avstängd. Inga nya trackers, analysverktyg eller loggtjänster.
- Basheaders: nosniff, DENY för iframe, no-referrer, avstängd kamera/mikrofon/plats
  och noindex/nofollow. Ingen falsk utfästelse om att noindex är åtkomstskydd.
- Plattformarnas egna runtime-/access-/valideringsloggar är inte filtrerade av
  apphooken och är **inte verifierat persondatafria**. Granskning av faktisk
  åtkomst, innehåll och retention i pilotmiljön återstår.

### CI

`.github/workflows/check.yml` kör nu check samt lokal Playwright med Chromium
och WebKit. GitHub Actions är pinnade till verifierade commit-SHA:n och checkout
sparar inte Git-credentials. `scripts/check-e2e-ci.mjs` kräver CI och ren checkout,
startar anonym lokal Convex, väntar på riktig health-query, konfigurerar lokal
auth och kör E2E. Inga molnnycklar eller auth-traces behövs. GitHub-workflowen har
inte körts på GitHub i denna session; lokala motsvarande testsviter är gröna.

## Verifiering

| Kontroll | Resultat |
|---|---|
| ESLint | Godkänt |
| Next.js + Convex TypeScript | Godkänt |
| Vitest/convex-test | **146/146**, 12 filer (22 nya fall) |
| Lokal Next-build | Godkänt, 14 routes inklusive data/health |
| Lokal Convex codegen/upload | Godkänt efter korrigerad masteryLevel-returtyp |
| Hela Playwright-sviten | **52/52**, 26 Chromium + 26 mobil WebKit, cirka 1,9 minuter |
| Nya pilot-E2E | 4/4; tre pass, framsteg, export, radering/återupptagning, health och publikt nekad bootstrap |
| `npm audit --omit=dev` | 0 rapporterade sårbarheter |
| Lokal full backup | Godkänd ZIP-integritet/SHA-256, 18 tabeller, filrättighet 0600 |
| `git diff --check` | Godkänt |
| Vercel/Convex molndeploy | Inte körd; användaren sköter deploy |
| Återställningsövning | Inte körd |
| Riktig veckolista + tre pass i pilotmiljön | Återstår hos familjen |

Säkerhetsregressioner omfattar anonym/förfalskad elev/annan familj, återkallad
session, explicit raderingsbekräftelse, radering samtidigt med svar, parallella
raderingsanrop, ny profil efter radering, begränsade batcher, gamla ordversioner,
export utan auth-/frågeplansdata samt produktion/fel miljö/fel nyckel.
Observability-testet matar in privata exempelvärden i fel/request/context och
kontrollerar att endast den fasta händelsekoden loggas.

Trepass-E2E går via riktig lokal auth och UI: fem skrivfrågor, fem flervalsfrågor,
fem flashcards, 90 XP totalt, adminuppföljning, faktisk JSON-nedladdning och
profilradering. Ny datasida testas med axe utan rapporterade överträdelser och
320 px utan horisontell overflow. Tidigare P0/P1-regressioner är fortsatt gröna.
Testerna använder syntetiska vuxenkonton/listor; endast dessa testprofiler
raderades. Tidigare lokala testkonton/data finns kvar.

## Fynd och avgränsningar

- Första typkontrollen hittade att rena repetitionsregler returnerar `number`
  för masteryLevel medan Convex kräver 0–3. Exportens projektion korrigerades
  enligt befintligt rapportmönster; följande typkontroll och codegen passerade.
- Nuvarande authmodell är fortfarande övervakad övning med förälderns konto,
  inte separat barnidentitet eller ett skyddat växlingsläge.
- Pilotbyggskriptet avvisar avsiktligt Vercel Production; publik release kräver
  ett nytt beslut och separata miljö-/auth-/integritetskontroller.
- Inga nya beroenden eller tjänster. Tidigare kända dev-beroenderisker har inte
  uppgraderats; säkerhetskontrollen ovan gäller installerade runtimeberoenden.
- Långsam verklig mobilanslutning, feedbackmålet 300 ms, riktiga tjänsteloggar och
  hosted CI har inte verifierats av lokala E2E.

## Kvar för att godkänna Etapp 5

Användaren deployar enligt driftguiden till rätt Vercel Preview och isolerad
Convex dev, verifierar auth och extern logghantering, dokumenterar en separat
återställningsövning och kör den riktiga veckolistan med minst tre övervakade
pass. Komplettera rapporten med URL/commit, datum, enhet/webbläsare och resultat.
Först därefter kan Etapp 5 markeras helt klar. Inga senare funktioner har påbörjats.
