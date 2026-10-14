# Etapp 0 – Foundation och autentisering

Datum: 2026-10-14. Status: **Etapp 0 genomförd och lokalt verifierad.**
Etapp 1 är inte påbörjad. Ingen produktionsmiljö eller molndeployment har ändrats.

## Underlag och avgränsning

Hela `GLOSAVENTYRET_MVP_PRD.md` version 1.0 lästes före implementation.
Repot innehöll då endast PRD:n och Git-metadata. PRD:n har lämnats oförändrad.
Under arbetet instruerade beställaren uttryckligen **”använd convex auth”**.
Det ersätter Clerk-valet i §3 för denna implementation. Inga Clerk-beroenden,
konton eller nycklar finns i lösningen.

Leveransen omfattar grundstruktur, lokalmiljö, en liten fungerande Convex-query,
svenska sidor, en sluten föräldra-auth-spike, säkerhetskontroller och testverktyg.
Gloslistor, import, elevprovisionering, övningar, statistik och spelifiering har
inte implementerats. Minsta roll-/sessionskontroll ingår för att auth-spiken
ska kunna verifieras; produktens övriga schema hör till senare etapper.

## Implementation

| Område | Filer och resultat |
| --- | --- |
| Next.js App Router | `src/app/`, `next.config.ts`, `tsconfig.json`; svenska intro-, inloggnings-, laddnings- och felsidor |
| UI | Tailwind 4 och shadcn med Base UI; `components.json`, `src/components/ui/`, `src/app/globals.css`; fokus, minst 44 px för kontroller, reduced motion, systemtypsnitt |
| Providers | `src/components/providers.tsx`, `src/app/layout.tsx`; officiella `ConvexAuthNextjsServerProvider` och `ConvexAuthNextjsProvider` |
| Auth och proxy | `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`, `src/proxy.ts`; officiell Password-provider, sessionshantering, HTTP/JWKS-routes, App Router-integration |
| Identitet och roll | `convex/schema.ts`, `convex/users.ts`; authbibliotekets tabeller samt optional `role`, `nickname`, `guardianId`; privata queryn kontrollerar identitet, levande session och lagrad föräldraroll |
| Sluten etablering | `convex/dev.ts`; intern `createGuardian`, endast loopback-backend, servergenererat lösenord och fast föräldraroll |
| Validering | `convex/lib/authPolicy.ts`; endast `signIn`, begränsade indata, vuxenadress normaliseras, klientens rollfält ignoreras |
| Liveness | `convex/health.ts`, `src/components/backend-status.tsx`; publik query returnerar enbart `{ status: "ok" }`, visar verklig anslutning |
| Lokalmiljö | `.nvmrc`, `.env.example`, `.gitignore`, `scripts/`; lokal Convex utan molnkonto, skydd mot fjärrmiljö och deploy-nycklar, idempotent auth-nyckelsetup |
| Kontroller | Vitest, convex-test, Playwright, axe, ESLint, TypeScript; `npm run check`, `npm run test:e2e`; `.github/workflows/check.yml` för lint/typer/unit/build |
| Körinstruktioner | `README.md`; lokal start, kontoetablering och testkommandon |

Låsta installationer finns i `package-lock.json`. Verifierade huvudversioner:
Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3, Convex 1.46.0,
Convex Auth 0.0.96, Auth.js Core 0.41.3, Tailwind 4.3.3, shadcn 4.21.4,
Vitest 5.0.4, convex-test 0.0.61 och Playwright 1.64.0. Körmiljö: Node 22.22.0.
`AGENTS.md` skapades automatiskt av Next.js och dess hänvisningar till
installerad Next-dokumentation har följts vid granskningen.

## Auth-beslut

### Förälder: implementerat och verifierat lokalt

Convex Auths `Password`-provider hanterar lösenordshashning, kontroll,
signerade tokens, refresh och sessioner. Appen implementerar ingen egen
lösenordskryptografi eller JWT-verifiering. Next-integrationen använder
HttpOnly/SameSite=Lax-cookies; Secure används av biblioteket utanför localhost.
HTTPS/Secure-cookiebeteende har inte verifierats mot någon driftmiljö.

Självregistrering är stängd i serverns providerkonfiguration, inte bara dold
i UI. `signUp`, reset och verifieringsflöden nekas. En lokal operatör skapar
vuxenkontot via en intern action, vars slumpade lösenord returneras en gång.
Varken lösenord, roll eller familjekoppling kan etableras genom ett offentligt
bootstrap-anrop. Detta är tillräckligt för Etapp 0, inte färdig onboarding.
Vuxenadressen används som identifierare men har **inte** e-postverifierats.

`guardianViewer` härleder användar-ID och sessions-ID från verifierad auth,
läser aktuell session och användarpost och nekar saknad/utgången/raderad session,
elevroll och saknad roll. Den returnerar bara smeknamn och föräldraroll,
aldrig e-post eller auth-tabeller. Klienten får inte välja användare/familj.
Sessionskontrollen gör att en utloggad sessions gamla JWT inte får läsa den
privata queryn trots kvarvarande tokenlivslängd. Rollkontroll i proxy/visningsläge
ersätter inte backendkontrollen.

Konfiguration: session högst 12 timmar, inaktivitetsgräns 1 timme och bibliotekets
rate limit med kapacitet fem felaktiga försök per konto och återfyllnad över
en timme. Fem snabba fel följt av rätt lösenord testas och ger
`TooManyFailedAttempts`. Detta är inte ett generellt IP-/trafikskydd.

`authSubject` och `by_auth_subject` från Clerk-förslaget används inte:
Convex Auth äger `users._id` och relationen genom `authAccounts`/`authSessions`.
Ingen parallell egen sessions- eller kontodatabas har skapats. Saknad roll
ger alltid nekad privat åtkomst.

### Elev utan e-post: utrett, inte aktiverat

Den officiella serverreferensen dokumenterar `createAccount` med valfri unik
identifierare, inklusive användarnamn, och `retrieveAccount` samt
`modifyAccountCredentials`. Det finns därmed stöd i biblioteket för att
administrativt etablera konton utan barnets e-post. Däremot är den färdiga
`Password`-providern i den installerade versionen e-postorienterad: dess
`profile` måste returnera `email`. Den kan inte påstås vara ett färdigverifierat
hanterat barnkontoflöde. Ett framtida användarnamnsflöde behöver en granskad
providerkonfiguration via bibliotekets officiella API, säker föräldraauktorisering,
kontolänkning, återställning och regressionsprov. Inga falska barnadresser,
PIN-koder eller egen tokenlösning har införts. Se
[Convex Auth serverreferens](https://labs.convex.dev/auth/api_reference/server)
och [Password-konfiguration](https://labs.convex.dev/auth/config/passwords).

**Beslut tills den designen och integritetsfrågorna är godkända:** följ PRD:ns
reservmodell med föräldrainloggad, övervakad användning. Etapp 0 har inga
övningar ännu. En senare elevvy under föräldrasession får inte beskrivas som
en separat säkerhetsroll. Föräldern måste vara närvarande på delad enhet.

### Leverantörsvillkor och barnintegritet

Convex Auth är ett bibliotek i appens backend, inte ett separat barnkonto
hos Clerk. Convexs integritetspolicy skiljer plattformens egen behandling
från kunddata: avsnitt 1 undantar kunddata, medan avsnitt 10 beskriver att
tjänsten inte riktas till barn under 13. Den formuleringen är därför inte
ensam ett förbud mot, eller godkännande av, denna familjeapps hanterade
elevidentiteter. Villkoren §5.1–5.2 lägger ansvar för laglig behandling och
särskilda skyddskrav på kunden. Texterna kontrollerades även i sidornas
inbäddade `srcDoc`, eftersom vanlig webbutläsning bara visade sidramen.
Se [Convex Privacy Policy](https://www.convex.dev/legal/privacy) och
[Terms of Service](https://www.convex.dev/legal/tos).

Om en svensk onlinetjänst riktad till barn använder samtycke som rättslig
grund krävs vårdnadshavarens samtycke för barn under 13. Detta avgör inte
ensamt vilken rättslig grund eller vilka leverantörsvillkor som gäller här.
Ansvar, samtyckesrutin, datalagring, DPA och raderingsrutin måste klarläggas
före riktig elevdata/pilot; inget generellt juridiskt godkännande lämnas av
denna tekniska spike. Se [IMY: personuppgifter om barn](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/personuppgifter-om-barn/).

Det tidigare Clerk-spåret avbröts efter beställarens ändring. Där hade
användarnamn och backendprovisionering dokumentärt stöd, men barnvillkoren
inte kunnat klareras. Den observationen är inte skälet till en teknisk
begränsning i Convex Auth.

## Säkerhet och avgränsningar

- Ingen offentlig registrering eller elevprovisionering. Inga barnuppgifter,
  födelsedatum, skola eller fullständiga namn har samlats in.
- Authbibliotekets genererade tabeller är inte exponerade genom egna publika
  listqueries. Den enda privata produktqueryn är serverauktoriserad.
- Inga glosor/facit/XP finns ännu. Säkerhetstester för dessa hör till respektive etapp.
- Ingen analytics, externa typsnitt eller trackingpixel i appen. Verktygens
  utvecklingstelemetri är en separat fråga och räknas inte som appanalytics.
- `.env.local`, `.convex/` inklusive lokal adminnyckel och databas, byggfiler
  och testartefakter ignoreras av Git. Nyckelmönstersökning i leveransfiler gav
  inga träffar. `.env.example` innehåller endast tomma värden och loopback-URL:er.
- Utvecklingsskripten nekar fjärrdeployment/deploy-nycklar. Backend lyssnar lokalt;
  ingen Vercel- eller Convex-produktionsdeploy har utförts. `next build` var
  endast en lokal kompilering.
- `Date.now()` i sessionskontrollen använder backendtid. Det är inte en
  timerprenumeration: framtida reaktiva produktqueries behöver fortsatt
  auth/tokenlivscykel och sessionskontroll, inte anta att klockan ensam triggar queries.

## Tester och resultat

| Kontroll | Faktiskt resultat |
| --- | --- |
| `npm run dev:backend` | Lokal anonym Convex startade; schema, index och funktioner laddades utan typ-/deployfel |
| `npm run setup:auth`, två körningar | Nycklar konfigurerade; andra körningen behöll befintliga nycklar |
| `npm run check` | Godkänd lint, root/Convex-typecheck, 24 tester och Next-build |
| `npm test` | 24/24: auth-input, stängda flöden, publik liveness, anonym nekad, lagrad roll, manipulerade claims/args, utgångna/raderade/felägda sessioner |
| `npm run test:e2e` | 16/16: åtta scenarier vardera i Chromium desktop och mobil WebKit |
| Verklig browser → Next → Convex → UI | Inloggning, privat föräldrasida, refresh, utloggning och ny nekad åtkomst verifierade utan authmock |
| E2E-säkerhet | Förfalskad cookie, anonyma skyddade routes, direkt `signUp`, publik intern-action, gammal token efter signout, cross-site POST och lösenords-rate-limit verifierade |
| Tillgänglighet | Axe utan överträdelser på intro och inloggningsfel; 320 px utan horisontell overflow; desktopbild inspekterad |
| Saknad frontendkonfiguration | Separat lokal build utan publika Convex-värden; intro fungerar, `/admin` ger 307 till inloggning och auth-API ger 503 |
| Miljöskydd | Test med deploy-nyckel avbryter lokalskript före backendstart |
| `npm audit --omit=dev` | 0 rapporterade sårbarheter |
| Full `npm audit` | 9 high-träffar i utvecklingsberoenden kring `braces` via ESLint/shadcn; inte en grön full audit |
| GitHub Actions | Workflow skapad; inte körd hos GitHub. Motsvarande `npm run check` körd lokalt |

E2E använder verkliga, syntetiska vuxenkonton med slumpade adresser under
`example.test`. Kontona och authhistoriken ligger kvar enbart i den ignorerade
lokala databasen. Inga verkliga elevkonton, molnkonton, e-postleveranser,
återställningsflöden eller manuell fysisk telefon har verifierats.

### Fel som hittades och rättades

1. Create Next App gav Node 20-typer; Vitest 5 kräver Node 22+-typer.
   Versionerna justerades utan `--force`/ignorerade peer dependencies.
2. Auth-dokumentationens installationsversion av Auth.js Core hade auditfynd.
   Uppdaterat till kompatibla 0.41.3; runtime-audit är nu ren.
3. Convex Auth 0.0.96 tappade redirect-status när middleware rensade en
   ogiltig cookie (`Location` men status 200). En smal adapter i `src/proxy.ts`
   bevarar cookies och återställer 307. Testet passerar i båda webbläsarna.
4. shadcn-knappens halvtransparenta hoverfärg gav 4,37:1 kontrast.
   Ändrat till en mörkare solid hoverfärg; axe passerar.
5. Testets globala alert-selector matchade även Nexts route-announcer.
   Testet avgränsades till sidans `main`.

## Kända hinder och inför nästa etapp

1. **Convex Auth är beta**, med äldre/deprecierade transitiva authberoenden.
   Versionsuppgraderingar kräver authregression, särskilt cookie-adaptern.
   Ingen falsk garanti om produktionsmognad ges. Se
   [Convex Auth introduktion](https://labs.convex.dev/auth).
2. **Föräldraonboarding är en lokal spike.** Etapp 1 behöver besluta och bygga
   ett stängt, verifierat vuxenflöde samt återställning. Nuvarande lokala
   operatörsbootstrap ska inte öppnas publikt. Inga externa nycklar behövdes
   för den verifierade lokala lösenordsinloggningen.
3. **Separat elevinloggning är inte godkänd eller byggd.** Innan Etapp 2 krävs
   verifierad hanterad användarnamnsprovisionering, rättighetsmatris,
   återställning och barnintegritetsbedömning. Reservmodellen kvarstår tills dess.
4. **Full dependency-audit har kvarstående utvecklingsfynd.** npm föreslog
   inkompatibla nedgraderingar; dessa har inte framtvingats. Följ upp
   [braces-advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) och
   uppdatera verktygen när kompatibel rättning finns.
5. **Backup, export och radering är inte pilotverifierade.** Innan riktiga
   barnuppgifter: dokumentera och prova full snapshot/export/import i separat
   dev-instans och radering av användare, authkonton, sessioner, refresh tokens
   och framtida härledda elevdata. Enbart radering av `users` räcker inte.
   För dagens helt syntetiska lokala miljö kan hela `.convex/local/default`
   tas bort efter att backend stoppats, om all lokal testdata ska kastas;
   detta är inte en selektiv raderings- eller backupmetod för pilotdata.

Starta med instruktionerna i `README.md`. Nästa etapp enligt PRD är admin och
glosimport, men den har inte påbörjats. Arbetet avslutas vid Etapp 0.

## Övriga primärkällor, kontrollerade 2026-10-14

- [Convex Auth setup](https://labs.convex.dev/auth/setup) och
  [manuell nyckelsetup](https://labs.convex.dev/auth/setup/manual).
- [App Router och serverautentisering](https://labs.convex.dev/auth/authz/nextjs).
- [Convex Auth schema](https://labs.convex.dev/auth/setup/schema).
- [Convex lokala deployments](https://docs.convex.dev/cli/local-deployments).
- [convex-test](https://docs.convex.dev/testing/convex-test).
- [shadcn med Next.js](https://ui.shadcn.com/docs/installation/next).
- Installerade Next.js-guider under `node_modules/next/dist/docs/`: proxy,
  authentication och Playwright, samt Convex Auths installerade provider-/proxykod.
