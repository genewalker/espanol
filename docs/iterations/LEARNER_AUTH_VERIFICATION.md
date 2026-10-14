# Verifiering av separat elevinloggning med Convex Auth

Datum: 2026-10-14. Historisk förstudie: verifiera möjligheten, inte aktivera barnkonton i piloten.

**Uppföljning:** efter användarens ”kör på” har produktimplementationen ersatt
testspiken. Se [LEARNER_AUTH_RESULT.md](LEARNER_AUTH_RESULT.md) för aktuell kod,
tester och avgränsningar. Nedan beskriver läget vid förstudien. Testspikens två
filer har ersatts av `tests/learner-auth.test.ts` och dess testfixtur;
produktprovidern testas nu direkt. Reset kan göras atomärt med Convex 1.46:s
nästlade mutationer, så separat tillståndsmaskin behövdes inte.

## Slutsats

**Tekniskt genomförbart med den installerade Convex Auth 0.0.96.** En separat
`ConvexCredentials`-provider kan använda användarnamn och lösenord, skapa en egen
elevidentitet utan e-post, samt använda bibliotekets konton, hashning via etablerat
hashbibliotek, signerade JWT:er, refresh och sessionsåterkallning. Förälderns
befintliga `Password`-provider kan behållas. Ingen egen JWT-, sessions- eller
PIN-lösning behövs.

Detta är inte ett färdigt barnkontoflöde i standardprovidern. Appen behöver egen
validering, serverauktoriserad föräldrahantering och koppling mellan konto och
övningsprofil. Den tidigare tekniska osäkerheten från Etapp 0 är nu utredd,
men elevinloggning är fortfarande **inte aktiverad** i appen.

## Officiellt stöd och installerad kod

| Behov | Verifierat stöd |
|---|---|
| Användarnamn utan e-post | `ConvexCredentials.authorize` och providerseparerad `account.id` |
| Föräldrahanterat konto | `createAccount` med serverbestämd `role: learner`, `guardianId` och ingen e-post/telefon |
| Lösenordskontroll | `retrieveAccount` med obligatorisk `secret` i inloggningsflödet |
| Lösenordsåterställning | `modifyAccountCredentials`, efter egen kontroll av förälderns identitet och ägarskap |
| Återkalla gamla sessioner | `invalidateSessions`; biblioteket raderar sessioner och tillhörande refresh tokens |
| Flera inloggningssätt | Skilda provider-ID:n för vuxen och elev |
| Begränsa felaktiga lösenord | Bibliotekets `maxFailedAttempsPerHour`, testat med fem försök |

Primärkällor: [ConvexCredentials](https://labs.convex.dev/auth/api_reference/providers/ConvexCredentials),
[server-API](https://labs.convex.dev/auth/api_reference/server) och
[Password-konfiguration](https://labs.convex.dev/auth/config/passwords).
Dokumentationen jämfördes med installerade `src/providers/ConvexCredentials.ts`,
`Password.ts` och `src/server/implementation/` i `@convex-dev/auth`.

`ConvexCredentials` saknar en förvald lösenordshashare: `crypto.hashSecret` och
`crypto.verifySecret` måste konfigureras. Spiken använder samma `Scrypt`-klass
och parametrar som installerade Password-providern, från befintligt transitivt
beroende `lucia`. Ingen kryptografisk algoritm har skrivits i appen. Lucia är
deprecierat; inför faktisk implementation behöver hashbiblioteket väljas uttryckligen
som ett direkt beroende med underhållsbedömning. Testspikens transitiva import ska
inte kopieras okritiskt till produktkoden. Convex Auth är fortsatt
[märkt beta](https://labs.convex.dev/auth).

## Lokal verifiering

Filer: `tests/fixtures/learner-auth-spike.ts` och `tests/learner-auth-spike.test.ts`.
Testfixturen registreras enbart i `convex-test` som ersättning för `auth` och som
en separat testmodul. Appens `convex/auth.ts`, schema och publika API har inte
ändrats. Testfixturens bootstrap är endast för syntetiska testkonton och får aldrig
deployas som en publik funktion.

Bibliotekets `createAccount`, `retrieveAccount`, `modifyAccountCredentials`,
`invalidateSessions`, sign-in, sign-out, store-mutationer, Scrypt och JWT-signering
körs på riktigt, utan authmock. En tillfällig RSA-nyckel skapas i testprocessens
minne. JWT-signatur, issuer och audience verifieras med `jose` innan subject ges
till `convex-test.withIdentity`. Databasen och Convex execution context är däremot
simulerade av `convex-test`; detta är **inte** ett test genom HTTP, Next-cookies
eller en webbläsare.

Elva regressionstester omfattar:

- Egen elevidentitet utan e-post och utan sammanlänkning med föräldrakontot.
- Lösenord lagras som hash och korrekt lösenord ger signerad session.
- Anonym kontoetablering och barnets egen registrering/återställningsflöde nekas.
- Elev nekas adminquery, adminmutation, kontoetablering och lösenordsåterställning
  även om klienten försöker ange föräldraroll.
- Publicerade listor i den egna familjen fungerar; utkast och andra familjer nekas.
- Bara rätt förälder får återställa lösenord; gammalt lösenord, gamla sessioner
  och refresh tokens slutar fungera, medan det nya lösenordet fungerar.
- Refresh och utloggning använder bibliotekets livscykel.
- Fem felaktiga lösenord blockerar även ett korrekt sjätte försök.
- Saknat, tomt, för kort eller för långt lösenord skapar ingen session.
- Ett befintligt användarnamn flyttas inte till en annan familj, även om samma
  lösenord skickas. `createAccount` kan återlämna ett befintligt konto när
  lösenordet matchar; ägarskapet måste därför kontrolleras även efter anropet.

Körning: `npm test -- tests/learner-auth-spike.test.ts`.
Slutlig `npm test`: **173/173 tester i 14 filer**, varav **11** nya auth-spiktester.
Lint och root-/Convex-typkontroll godkända. Första typkontrollen hittade en felaktig
generisk testtyp; den rättades till bibliotekets `TestConvex<typeof schema>`.
Ingen ny Next-build eller browser-E2E behövdes för testfixturen; inget produktflöde
har ändrats och sådan verifiering av elevinloggningen återstår till implementationen.

## Rekommenderad implementation i nästa etapp

1. Behåll förälderns e-postinloggning. Lägg till en separat, enbart inloggande
   elevprovider. Kräv ett riktigt lösenord innan `retrieveAccount` anropas:
   utan `secret` gör biblioteket endast kontouppslagning, ingen lösenordskontroll.
2. Låt inloggad förälder skapa barnkontot från adminsidan. Härled familj och roll
   på servern. Använd smeknamn och ett opersonligt, unikt användarnamn; varken
   barnets e-post, födelsedatum, skola eller fullständiga namn behövs.
3. Koppla kontot till befintlig `learnerProfiles`-post med en valfri indexerad
   användar-ID-relation. Behåll profil-ID, XP, ordprogression och historik.
   Nuvarande övningsfunktioner kräver föräldraroll; de måste få en granskad
   åtkomstkontroll för både rätt förälder och just den kopplade eleven.
4. Separera rollstyrd navigation och serverauktorisering. En elevsession ska
   aldrig öppna admin genom ett byte av vy. Föräldern autentiseras separat.
5. Implementera återupptagbar kontoetablering, lösenordsåterställning och radering.
   `modifyAccountCredentials` och `invalidateSessions` är **två transaktioner**.
   En serverlagrad spärr under återställning/radering behöver stoppa inloggning,
   ny sessionsskapning och privat åtkomst tills hela åtgärden lyckats; fel och
   samtidiga anrop ska testas. `beforeSessionCreation` är en dokumenterad callback
   att granska för den spärren. Testspiken bevisar bara det sekventiella lyckade flödet.
6. Utöka profilradering till barnets authkonto, sessioner och relaterad authdata.
   Nuvarande radering tar bara hand om övningsprofil och resultat.
7. Kör browser-E2E för båda rollerna: inloggning, refresh, delad enhet, utloggning,
   förälderns återställning, nekad adminåtkomst och bibehållen progression.

Rate limit som testats är per befintligt konto, inte ett allmänt trafik-/IP-skydd.
Login bör ge samma neutrala fel för okänt konto och fel lösenord; separata gränser
för förälderns hanteringsanrop och samtidiga operationer måste provas.

## Leverantörsvillkor och avgränsning

Barnet skulle få en identitet i vår app, inte ett konto för att administrera
Convex-plattformen. Convexs [integritetspolicy](https://www.convex.dev/legal/privacy)
§1 skiljer kunddata från plattformens egen personuppgiftsbehandling. §10 säger
samtidigt att tjänsterna inte riktas till barn under 13. Detta är inte ett
uttryckligt godkännande av barnkonton i Glosäventyret, men inte heller i sig ett
tekniskt hinder i authbiblioteket.

[Villkoren](https://www.convex.dev/legal/tos) §5.1–5.2 lägger ansvar för kunddata,
nödvändiga tillstånd och särskilda skyddskrav på kunden.
[DPA](https://www.convex.dev/legal/dpa) §3.1 och §10 beskriver behandlingsroller
och inkluderar användare av kundens appar bland möjliga registrerade.
Sidornas inbäddade dokument (`srcDoc`) lästes eftersom den vanliga webbutläsningen
bara visade sidramen. Inget uttryckligt leverantörsbesked som godkänner just vårt
barnkontoupplägg har erhållits. Föräldrakontroll, information/samtyckesrutin,
datalagring och fullständig radering måste ingå i den konkreta designen enligt PRD.
Denna verifiering lämnar inget generellt juridiskt godkännande för publik tjänst
eller skolanvändning.

## Resultat och nästa beslut

Teknikvalet **Convex Auth kan behållas**. Inga nya tjänster eller beroenden har
installerats. Inga barnkonton har skapats i någon beständig databas, inga authnycklar
har lästs ur miljöfiler och inga lokala eller externa deployments har ändrats.
Nästa etapp är implementation med ovanstående serverkontroller, användarflöden
och acceptanstester; spiken i sig ändrar inte pilotens övervakade authmodell.
