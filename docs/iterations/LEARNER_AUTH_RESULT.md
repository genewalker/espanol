# Uppföljning – Föräldrahanterad barninloggning

Datum: 2026-10-14. Beställd efter verifieringen av Convex Auth och användarens
”kör på”. Detta kompletterar PRD §3 och elevflödet från Etapp 2; det är inte en
ny numrerad PRD-etapp eller ett godkännande av återstående pilotacceptans.

## Implementation

- Föräldern skapar ett konto på `/admin/learner`, via **Barnets inloggning**.
  Profil skapas först om den saknas. Användarnamn, lösenord och bekräftelse av
  vårdnadshavaransvar krävs. Ingen barnregistrering utan förälderns session.
- Barnet loggar in på `/sign-in/learner` med en separat `learner-password`-provider
  (`ConvexCredentials`). Förälderns befintliga `Password`-provider behålls.
  Convex Auth hanterar konton, sessionslivscykel, JWT, cookies och refresh.
- Kontot innehåller serverbestämd `role: learner` och `guardianId`. Ingen e-post,
  telefon, ålder eller fullständigt namn behövs. Användarnamn normaliseras till
  gemener, är globalt unikt inom elevprovidern och kan inte ändras i denna version.
- Lösenord: 12–128 tecken. `@noble/hashes`, redan ett direkt beroende, används för
  scrypt med separat 16-byte salt, N=32768, r=8, p=3 och 32-byte hash. Fast versionerat
  hashformat och jämförelse utan tidigt byteavbrott. Biblioteket utför KDF:n;
  ingen egen kryptografisk algoritm eller tokenimplementation. Synkron scrypt
  används eftersom async-varianten använder timers som inte stöds i mutationer.
- Valfria fält i `users` och `learnerProfiles`, plus index `by_learner`. Befintlig
  profil behåller sitt ID, ordprogression, pågående pass, historik, XP och märken.
  Inga migreringar eller nya beroenden behövs.
- Övningsfunktionerna använder serverkontrollerad familj/profil för både förälder
  och kopplad elev. Admin, import, publicering, export, profiländring, kontohantering
  och radering kräver föräldraroll. Klientens roll/familje-ID ger ingen behörighet.
- Barnet ser publicerade familjelistor, egna resultat, repetition och belöningar.
  Adminlänken visas bara för föräldern. Direkt adminnavigation från barnsession
  omdirigeras till övning; direkta admin-API-anrop nekas också på servern.
- På delad enhet ersätter ny inloggning tidigare session. Övervakad övning med
  förälderns session finns kvar och markeras tydligt i UI.
- Föräldern kan byta barnets lösenord. Gamla sessioner och refresh tokens återkallas
  omedelbart; förälderns sessioner påverkas inte. UI visar aldrig sparat lösenord.
- Profilradering spärrar omedelbart barnets inloggning, refresh och privat åtkomst.
  Fortsatta, begränsade batcher tar bort barnets authdata och övningsdata. Föräldern
  kan återuppta från **Dina data** om fliken eller anslutningen stängs.

## Transaktioner och säkerhetsgranskning

`convex/learnerAccounts.ts` innehåller guardian-skyddade mutationer för skapande
och reset samt interna funktioner för inloggning. Konto och profil länkas i en
transaktion. Credentialändring, återkallning, upplåsning av auth-rate-limit och
ökning av credentialversion sker också i en transaktion. Samtidiga reset-anrop
med samma version kan därför inte skriva över varandra utan besked.

Convex 1.46 stödjer nästlade mutationer i samma transaktion. Convex Auth 0.0.96:s
`createAccount`, `modifyAccountCredentials` och `invalidateSessions` använder
endast `ctx.runMutation`, även om hjälparnas TypeScript-typer kräver `ActionCtx`.
En isolerad, kommenterad typadapter används därför i `convex/lib/learnerAuth.ts`.
Tester injicerar fel efter nästlade anrop och verifierar full återställning av
konto, profil, lösenord, version och sessioner. Någon separat pending-jobbmodell
behövs inte för dessa två korta mutationer.

Inloggningen läser credentialversion före lösenordskontrollen. En intern mutation
kontrollerar samma version och aktiv profil när bibliotekets session skapas.
`jwt.customClaims` kontrollerar profil och att sessionen fortfarande finns innan
biblioteket utfärdar token. Därmed stoppas reset/radering mellan lösenordskontroll,
sessionsskapande och tokenutfärdande. Befintliga publika funktioner kontrollerar
även den lagrade sessionen, så ett ännu giltigt JWT kan inte återge återkallad åtkomst.

Gränser: bibliotekets fem felaktiga lösenord per konto/timme, tio föräldrahanterade
kontoändringar per profil/timme, högst tjugo lagrade barnsessioner och hundra
poster med refresh tokens per session. De sista gränserna håller bibliotekets sessionsåterkallning under
praktiska transaktionsgränser. Vid uppnådd sessionsgräns kan föräldern återställa
lösenordet; vanlig utloggning rensar den sessionen. Detta är inte ett allmänt IP- eller
DDoS-skydd. Okänt användarnamn, fel lösenord och spärrad inloggning får samma neutrala fel.

Granskad enligt `convex:convex-reviewer` och `vercel:react-best-practices`:
serverroller/ägarskap, interna hjälpfunktioner, args/returns-validatorer, index,
begränsade batcher, dataminimering, formuläretiketter och rollstyrd navigation.
Säkerhetskontroller av sessionstid använder serverns tid, aldrig klientens klocka.

## Verifiering

Endast loopback/local Convex och syntetiska konton användes. Befintlig lokal
backend är uppladdad med nya funktioner; molnets pilot/prod har inte ändrats.
Ingen Vercel-deploy, commit eller push har gjorts i denna implementation.

| Kontroll | Resultat |
|---|---|
| Lint, Next/Convex TypeScript och produktionsbuild | Godkända (`npm run check`, samt ny build efter kontrastfix) |
| Vitest, hela sviten | **179/179**, 14 filer, varav 17 produkt-authregressioner |
| Playwright Chromium + mobil WebKit | **54/54**, 27 per webbläsare, cirka 2,2 minuter |
| Riktig lokal Convex/JWT-gateway | Skapande och barninloggning verifierade |
| Tillgänglighet och 320 px | Nya kontosidan: axe utan överträdelser, ingen horisontell overflow |

`tests/learner-auth.test.ts` testar produktprovidern och verkliga Convex Auth-
funktioner, hashning, signering och refresh. `convex-test` simulerar databas/context;
JWT verifieras med `jose` före `withIdentity`. Testfixturen med bootstrap och
felinjektion ligger under `tests/fixtures/` och deployas inte. Den tidigare isolerade
spiken ersätts av dessa produktregressioner.

Tester omfattar bibehållen XP/profil, komplett övningspass, publicerade listor,
nekade drafts/annan familj/adminanrop, fel/missade lösenord, avstängd självregistrering,
samtycke, unika användarnamn, parallellt skapande/reset, rate limits, rollback,
reset-race, refresh, utloggning, felaktig familjekoppling och stegvis fullständig
radering inklusive mer än hundra testposter med refresh tokens.

`tests/e2e/learner-auth.spec.ts` kör föräldrainloggning → profil/konto i UI → byte till
barn på samma enhet → nekad adminnavigation/API → fem korrekta skrivsvar → omladdning
mitt i passet → barnets framsteg och förälderns rapport → lösenordsbyte → gamla
credentials/sessioner/refresh nekas → nytt lösenord fungerar → utloggning → radering.
Testet körs i Chromium och emulerad iPhone/WebKit, utan authtraces, skärmbilder eller
loggning av riktiga lösenord/token.

Fel som hittades och åtgärdades under arbetet:

- Async scrypt använde timers; bytt till bibliotekets synkrona implementation.
- Några övningssidor hade kvar guardian-only SSR-kontroll och skapade en redirectloop
  för barnet; samtliga `/app`-sidor använder nu den gemensamma autentiserade vyn.
- Hjälptext ingick i användarnamnsfältets etikett; den är nu separat `aria-describedby`.
- Hela browserregressionen hittade tillfälligt låg textkontrast under en befintlig
  feedbackanimation. Opacitetsändringen togs bort; rörelsen och reduced-motion-stödet
  behölls. Den första fulla körningen gav 53/54; ny slutkörning dokumenteras i tabellen.
- E2E:s generella alert-locator matchade även Next route-announcer; begränsad till main.

## Drift och begränsningar

- Förälderns publika registrering, verifiering av e-post och e-poståterställning är
  fortsatt avstängda. Befintlig operatörsstyrd föräldraetablering gäller.
- Ett barn per familj i MVP. Inget användarnamnsbyte eller stöd för flera barn i UI.
- Convex Auth är beta. Typadaptern och användningen av intern `auth.store` för
  sessionsskapande är versionskänsliga; uppgradering måste gå genom auth-, rollback-
  och browserregressionerna. Lockfilen ska användas vid installation.
- De tidigare dokumenterade leverantörs-/integritetsbedömningarna är inte ett
  generellt juridiskt godkännande för publik lansering eller skolanvändning.
  Den här implementationen aktiverar inget i molnet.
- Ta privat backup före pilotrelease. Backend först, sedan motsvarande frontend.
  Inga nya env-variabler eller authnycklar krävs. Se
  [PILOT_RELEASE.md](../operations/PILOT_RELEASE.md#uppföljningsrelease-separat-barninloggning).
  Rulla inte tillbaka till det gamla schemat efter att nya barnfält skrivits.
- Radering i appen raderar inte tidigare exporter eller backups. Dessa behöver
  gallras separat enligt befintlig driftrutin.
- Familjens manuella acceptans, verklig telefon och Etapp 5:s återställningsövning
  kvarstår. Automatiska tester ersätter inte dessa godkännanden.

## Källor

- [Convex Auth server API](https://labs.convex.dev/auth/api_reference/server)
- [ConvexCredentials](https://labs.convex.dev/auth/api_reference/providers/ConvexCredentials)
- [Convex MutationCtx](https://docs.convex.dev/api/interfaces/server.GenericMutationCtx)
- [Convex best practices: nästlade mutationer](https://docs.convex.dev/understanding/best-practices)
- [Noble hashes](https://github.com/paulmillr/noble-hashes)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Tidigare verifiering inklusive villkorsgranskning](LEARNER_AUTH_VERIFICATION.md)
