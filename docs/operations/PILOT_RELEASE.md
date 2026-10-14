# Familjepilot – deploy och drift

Status: förberett och testat lokalt i Etapp 5. Användaren sköter Vercel-deployen
på sitt andra Vercel-konto. Ingen extern deploy eller produktion har ändrats av
agenten. Projektbenämningen är `espanol`; exakta externa team-/deployment-ID:n
har inte verifierats. Kontrollera dem i respektive dashboard innan kommandon körs.

## Miljöer

| Miljö | Frontend | Backend och data | Nycklar |
|---|---|---|---|
| Lokal utveckling/test | Next på localhost | Lokal anonym Convex | `.env.local`, lokala auth-nycklar |
| Privat familjepilot | Vercel **Preview**, fast preview-URL | Separat **dev-deployment** i Convex-projektet `espanol` | Eget auth-nyckelpar och en specifik dev-deploynyckel hos operatören |
| Produktion | Ingår inte | Ingår inte | Inga produktionsnycklar får användas |

Välj en isolerad dev-deployment utan annan familjs eller produktionsdata.
Piloten använder en varaktig dev-deployment för att behålla familjens data mellan
frontendbyggen. En ny databas per PR är inte lämplig för den här pilotens historik.
Detta är ett medvetet alternativ till Convex standardflöde som deployar backend
inne i Vercels bygge. [Convex/Vercel-anvisningar](https://docs.convex.dev/production/hosting/vercel).

`vercel.json` bygger med `npm run build:pilot`. Bygget avvisar Production,
felaktiga URL-par och deploynycklar i frontendmiljön. Det är en kontroll av angiven
konfiguration, inte ett oberoende bevis för molndeploymentens verkliga typ:
kontrollera **Development** i Convex dashboard. Backendkommandot accepterar
endast en `dev:<exakt-namn>|…`-nyckel för samma deklarerade deployment. Nyckelformat
kontrollerat mot installerad Convex CLI 1.46.0; okända format nekas.

## 1. Förbered backend och auth

1. Välj rätt team och projekt `espanol` i Convex dashboard. Välj/skapa en isolerad
   **Development**-deployment. Notera dess namn och `.convex.cloud`/`.convex.site`.
2. Bestäm en fast Vercel-preview-origin för pilotgrenen, utan avslutande `/`.
   Familjen ska använda den adressen konsekvent. Kopiera `.env.pilot.example`
   till `.env.pilot.local` och fyll i värdena privat. `.env.local` ska behållas.
3. Skapa en **dev-deploymentnyckel för just denna deployment**, med behörighet för
   deploy och miljökonfiguration. Lägg den endast i `.env.pilot.local`.
   Skriv inte nyckeln i chatten, kommandoradsargument, Git eller Vercel.
4. Kör lokala verifieringar innan publicering:

```sh
npm run check
npm run test:e2e
npm audit --omit=dev
```

5. Kör följande avgränsade operatörskommandon. De ändrar endast den dev-deployment
   som matchar filens nyckel, aldrig den lokala backendens inställningar:

```sh
npm run pilot:backend -- setup-auth
npm run pilot:backend -- deploy
```

`setup-auth` skapar `JWT_PRIVATE_KEY` och `JWKS` endast om båda saknas; ett halvt
nyckelpar stoppar kommandot. Befintliga nycklar ersätts inte. Det sätter även
`SITE_URL`, `PILOT_DEPLOYMENT_NAME`, `AUTH_LOG_LEVEL=ERROR` och
`AUTH_LOG_SECRETS=false` i pilotens Convex. Säkerställ att SITE_URL matchar den
fasta frontendadressen. [Convex Auth: separat miljökonfiguration](https://labs.convex.dev/auth/production).

6. I **pilotens** Convex dashboard, kör den interna funktionen
   `pilot:createGuardian` med den vuxnes e-postadress. Lösenordet visas en gång
   i operatörens resultat. Förvara det i lösenordshanterare; dela inte resultatet
   eller skärmbilder. Funktionen är inte åtkomlig från publik webbläsarklient.
   Återanvänd inte funktionen som lösenordsåterställning för befintliga konton.
   `dev:createGuardian` är fortfarande begränsad till lokal utveckling.

Auth använder etablerade Convex Auth, ingen egen token/PIN. Ingen självregistrering,
e-postverifiering eller återställningsvy är aktiverad. Pseudonymprofilen är inte
en egen inloggning; föräldern ska vara närvarande under barnets hela övning.

## 2. Vercel Preview – användarens deploy

Använd rätt Vercel-team och projekt. Länka pilotgrenen som en **Preview**, inte
produktionsgrenen. Behåll Deployment Protection för den privata familjepiloten
med en åtkomstmetod som den vuxne kan använda på pilottelefonen. Kontrollera att
skyddet även gäller den fasta preview-adressen. Ingen hemlig bypass-token ska
läggas i appen, Git eller rapporten. [Vercels miljöer](https://vercel.com/docs/deployments/environments).

Lägg följande i **Preview**-miljön, med värden som matchar `.env.pilot.local`:

| Variabel | Värde |
|---|---|
| `PILOT_CONVEX_DEPLOYMENT` | `dev:<deploymentnamn>` |
| `NEXT_PUBLIC_CONVEX_URL` | `https://<deploymentnamn>.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://<deploymentnamn>.convex.site` |
| `PILOT_APP_ORIGIN` | Den fasta preview-origin som används som SITE_URL |

`VERCEL_ENV=preview` tillhandahålls av Vercel. Ingen `CONVEX_DEPLOY_KEY`,
`JWT_PRIVATE_KEY`, `JWKS` eller lokal `CONVEX_DEPLOYMENT` behövs i Vercel.
Next.js/Node 22 och `npm ci` används. `package-lock.json` är auktoritativ.
`.vercelignore` utesluter privata env-filer, lokala databaser, exporter och backups.

Deploya Preview från den granskade koden. Låt `vercel.json` styra buildkommandot;
byt inte till ett obevakat `convex deploy` i Vercel. Öppna pilotens fasta adress
på enheten och verifiera inloggning, omladdning, utloggning och ny inloggning.
Gamla lokala inloggningsuppgifter följer inte med automatiskt till den nya databasen.

## 3. Kontroller efter deploy

- Frontend `/api/health`: endast `{"status":"ok"}`, `Cache-Control: no-store`.
  Detta kontrollerar frontendens livstecken, inte databas eller autentisering.
- Convex `health:check`: endast `{"status":"ok"}`. Kör den separat i rätt
  deployments dashboard; den publika startsidan anropar också denna query.
- Oinloggad besökare nekas `/admin`, `/admin/data` och `/app`.
- Föräldern kan logga in och skapa/publicera en liten testlista, besvara en fråga,
  ladda om, se samma feedback och logga ut. Utloggning återkallar sessionen.
- Byt till familjens riktiga veckolista först efter att dessa kontroller fungerar.
- Dokumentera deploy-URL, Git-commit, backenddeployment, datum och resultat i
  `docs/iterations/ITERATION_5_RESULT.md`, utan nycklar eller elevuppgifter.

Automatiska E2E är avsiktligt låsta till lokal Convex och använder syntetiska
vuxenkonton. Ändra inte den spärren för att testa en delad pilotdatabas.

## Backup och export

Föräldern kan använda **Dina data → Hämta JSON** på `/admin/data`, en lista i taget.
Exporten innehåller även inaktiva ord, accepterade svar, ordversion och aktuell
progression, samt profilens totala XP/märken. Utkast/arkiv stöds. Exporten
innehåller inte lösenord/auth-tabeller, frågeplaner eller historiska övningssvar.
Det är en läsbar datakopia, inte ett återställningsformat.

Operatörens fullständiga backup tas via Convex **Backup/Export** i rätt dev-deployment.
Ladda ned hela ZIP-snapshoten; tabellernas ID-relationer ska bevaras. Kontrollera
vald miljö före exporten. CLI-alternativ och format finns i
[Convex exportdokumentation](https://docs.convex.dev/database/import-export/export).

För nuvarande lokala databas finns ett skyddat kommando:

```sh
npm run backup:local
```

Det skapar `backups/local-<tid>.zip` och en SHA-256-fil. Katalogen har rättigheter
0700 och filerna 0600 på Unix; detta är **inte kryptering**. Full backup innehåller
privata profil-/svarsdata och auth-tabeller. Förvara den på krypterad disk eller
krypterat arkiv, med åtkomst endast för ansvarig vuxen. Ingen backup laddas upp av
skriptet. Git och Vercel ignorerar katalogen.

Pilotens rutin: backup före varje release/schemaändring och efter en dag med nya
övningar, högst sju dagars rullande lagring. Operatören ansvarar för gallring;
inget automatiskt jobb är aktiverat. Appens JSON-exporter i webbläsarens hämtningar
måste också hanteras privat och gallras. En backup på samma dator räcker inte vid
diskhaveri; en krypterad kopia på separat lagringsmedia behövs för det skyddet.

## Återställning och rollback

Återställningsrutinen är dokumenterad men har **inte körts mot en separat
återställningsdeployment** i denna etapp. Lokal ZIP-integritet/kontrollsumma och
förväntade tabeller har verifierats; det bevisar inte full återställning.

1. Stoppa användning av berörd pilot och ta en ny backup av aktuellt läge.
2. Skapa en isolerad dev-/testdeployment. Kontrollera dess namn, typ och nyckel;
   använd aldrig production som provmål. Installera kompatibel backendkod/schema.
3. Återställ **hela** ZIP-snapshoten via Convex backup/import. Använd inte
   separata tabellimporter som kan bryta ID-relationer. `--replace` ersätter bara
   snapshotens tabeller och är destruktivt; `--replace-all` ska inte användas här.
   [Convex återställning från ZIP](https://docs.convex.dev/database/import-export/import).
4. Konfigurera authmiljö och SITE_URL för testmålet separat. Export av data är
   inte en backup av miljövariabler, Vercel-konfiguration eller källkod. Hantera
   nyckelmaterial separat i lösenordshanterare; kopiera inte fungerande sessioner
   och nycklar till en offentligt åtkomlig testmiljö.
5. Kontrollera listor/ord, profil, tre pass/resultat, progression och märken.
   Verifiera inloggning/utloggning. Repetera profilraderingar som skett efter
   snapshoten innan åtkomst åter öppnas; raderad data får inte återpubliceras.
6. Dokumentera resultat och välj först därefter om piloten ska återställas.
   Förväntad möjlig dataförlust är tiden sedan senaste backup, inte noll.

Vid enbart frontendfel: återställ den tidigare testade **Preview**-versionen på
pilotens fasta preview-adress via Vercel, med samma backend och miljövariabler.
Använd inte production promotion/rollback. Backend och data återställs inte av
en frontendrollback. Behåll i första hand den bakåtkompatibla backendversionen.

Vid backendfel: granska diff/schema mot föregående commit, ta backup och deploya
en kompatibel korrigering till den avgränsade dev-deploymenten. En äldre version
kan neka nya fält (exempel: `learnerProfiles.deleting`). Gör klart en påbörjad
radering och kontrollera schema innan gammal kod övervägs. Återställ inte data
för att lösa enbart ett gränssnittsfel. Kör smoke-kontrollerna igen.

## Radering och datalivscykel

Föräldern öppnar `/admin/data`, exporterar vid behov och skriver **RADERA**.
Raderingen omfattar profil, alla dess pass, frågesnapshots, svar, progression,
XP och märken. Gloslistorna och föräldrakontot behålls, vilket framgår i UI.

En serverlagrad spärr hindrar nya övningsskrivningar och profiländringar.
Servern raderar en session med högst tio frågor/svar per anrop, därefter högst
100 progressrader och till sist märken/profil. Vid tappad anslutning eller stängd
flik: öppna sidan igen och välj **Fortsätt raderingen**. Ingen bakgrundskörning
lovas när fliken är stängd. Föräldern kan skapa en ny profil först efter slutförd
radering; retry med gammalt profil-ID påverkar inte den nya profilen.

Privat pilots manuella reservrutin: ansvarig förälder återupptar samma flöde på
en fungerande enhet. Om auth saknas behövs operatörshjälp i den valda dev-miljön;
skapa inte en egen PIN-/tokenväg. Det finns ingen publik lösenordsåterställning.
Radering av hela vuxenkontot/familjens glosor ligger utanför profilknappen och
måste planeras separat. För publik lansering är full kontolivscykel fortfarande
en blockerande begränsning.

Operatören gallrar tidigare ZIP-backups enligt ovan. Vid raderingsbegäran ska
äldre kopior förstöras eller isoleras fram till gallring och inte återöppnas för
användning. Informera om att redan nedladdade JSON-filer finns hos mottagaren.

## Observability utan app-loggning av elevdata

`src/instrumentation.ts` rapporterar endast fasta fälten
`event=server_request_failed` och `service=glosaventyret`. Inga felmeddelanden,
stackar, URL:er, headers, cookies, ord, svar, smeknamn eller ID:n skickas av hooken.
Convex React-klientens konsolloggning är avstängd. Ingen analytics, session replay,
log drain eller extern felrapportering har installerats.

Kontrollera manuellt Vercels status/felkoder och Convex funktionsfel/latens vid
release och inför pilotdag. Vid upprepade fel: stoppa övningen, kontrollera
health separat för frontend/backend, vald miljö och auth-origin, och följ
rollbackrutinen. Kopiera inte funktionsargument, råa felobjekt eller authresultat
till ärenden/chatten. Logga inte testbarnets verkliga uppgifter.

Plattformarnas egna access-/runtime-/valideringsloggar omfattas inte av hookens
filtrering och kan innehålla t.ex. URL, IP eller inskickade argument vid ett fel.
De är **inte verifierat persondatafria**. Begränsa dashboardåtkomst till vuxen
operatör, håll auth på ERROR och secrets-redigering på, aktivera inga loggexporter,
och kontrollera logginnehåll och retention på det riktiga pilotkontot före
inbjudan. Detta lokala arbete gör inte någon juridisk bedömning av publik drift.

## Manuell acceptans för Etapp 5

- [ ] Preview + separat Convex dev verifierade; rätt URL och auth-origin.
- [ ] Inloggning, refresh och utloggning på familjens enhet fungerar.
- [ ] Föräldern importerar/publicerar den riktiga veckolistan; felrader rättas.
- [ ] Barnet genomför minst tre pass med närvarande förälder: skriv, flerval och flashcards.
- [ ] Resultat, repetition, XP och adminstatistik stämmer.
- [ ] JSON-export fungerar; radering provas på en separat **testprofil**, inte familjens historik.
- [ ] Pilotbackup finns privat; återställningsövning i isolerad miljö dokumenterad.
- [ ] Logginnehåll, åtkomst och retention kontrollerade på de externa tjänsterna.

Anteckna datum, enhet/webbläsare, deploy-URL/commit och godkännande i iterationsrapporten.
Varken automatiska trepass-tester eller tidigare mobilgodkännande ersätter
acceptansen med den riktiga veckolistan i den nya pilotmiljön.
