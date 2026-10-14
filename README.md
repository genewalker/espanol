# Glosäventyret

Etapp 3: föräldraadmin, glosimport, övervakad övning, repetition och statistik.
Next.js App Router, TypeScript, Tailwind/shadcn och Convex Auth.

## Starta lokalt

Node 22.12+ (22 LTS) och npm krävs. Använd `nvm use` om du har nvm.

```sh
npm ci
npm run dev:backend
```

Låt backend-terminalen vara igång. Första starten laddar ned Convex lokala
backend och skapar `.env.local` och `.convex/`. Inget molnprojekt behövs.
Utvecklingsskripten vägrar moln-/produktionskonfiguration.

I en andra terminal:

```sh
npm run setup:auth
npm run dev
```

Öppna [localhost:3000](http://localhost:3000). Startsidan anropar en riktig
Convex-query. Om port 3210 är upptagen, använd URL:erna som Convex skriver i
`.env.local`. `.env.example` visar fälten; kopiera aldrig produktionsnycklar hit.
`setup:auth` skapar bibliotekets RSA-nycklar lokalt, lämnar befintliga nycklar
orörda och skriver inte ut dem. Detta är Convex Auths dokumenterade setup,
inte en egen JWT-implementation.

Om ändringar i `globals.css` inte syns: starta om `npm run dev` och ladda om
sidan. Den installerade Tailwind/Turbopack-kombinationen har under lokal
verifiering behållit gammal CSS i en redan körande devserver. Ny start och
`npm run build` läser de aktuella stilarna korrekt.

## Föräldrakonto för lokal testning

Med backend igång, kör följande operatörskommando med din egen vuxenadress:

```sh
npx convex run dev:createGuardian '{"email":"foralder@example.test"}'
```

Kommandot returnerar ett genererat lösenord en gång. Förvara det privat.
Ingen e-post skickas. Kommandot är en **intern**, lokalt begränsad funktion;
det kan inte anropas av webbläsarklienter. E-postadressen är inte verifierad
av någon e-posttjänst. Självregistrering, barnkonton och lösenordsåterställning
är avstängda. Använd inte detta bootstrap-flöde för publik drift.

Logga in på `/sign-in`. `/admin` visar dina gloslistor.
`/app` visar övningsvyn under förälderns session. Detta är PRD:ns reservmodell:
föräldern ska vara närvarande. Visningsläget är inte en separat säkerhetsroll
och ger fortfarande åtkomst till föräldrasidan.

## Testa övningarna

1. Publicera en gloslista på föräldrasidan. Din färglista går bra.
2. Välj **Öva tillsammans** och skapa en övningsprofil med ett påhittat smeknamn.
   Profilen har ingen e-post, inget lösenord och ingen egen inloggning.
3. Välj lista, **5 eller 10 frågor**, riktning och övningsläge.
4. Skriv svaret och tryck Enter/**Rätta**, välj ett flervalsalternativ eller
   vänd ett flashcard och markera **Kunde**/**Behöver öva**.
5. Ladda om efter ett svar. Samma feedback finns kvar; välj **Nästa fråga**.
   Du kan också återvända till övningsstarten och välja **Fortsätt öva**.
6. Välj **Visa resultat** efter sista frågan. Självskattning visas separat
   från serverrättade svar. **Avsluta i förtid** bevarar redan sparade svar.

Accenter och ñ är betydelsebärande: `si` är inte `sí`. Artiklar krävs när de
ingår i glosan, om inte ett alternativt svar lagts till av föräldern. Rättningen
ignorerar yttre whitespace, upprepade mellanslag, skiftläge och avslutande
`.`, `!`, `?`, `…`. Flerval faller tillbaka till skrivfråga när det finns färre
än tre unika alternativ. Färre unika ord ger ett kortare pass.

Ett pass åt gången och högst 50 nya pass under ett rullande dygn per profil.
Svar och feedback sparas på servern; oskickad text finns bara i fliken och
försvinner vid omladdning. Vid nätproblem: invänta sparbekräftelsen.
Arkivering/avpublicering stoppar ett aktivt pass; sparade resultat finns kvar.
Ordändringar påverkar nya pass, medan pågående pass använder sin sparade version.
XP, märken och bossutmaning kommer i Etapp 4.

## Testa repetition och statistik

1. Starta ett pass med **Rekommenderat**: upp till 60 % repetition och 40 % nya
   ord när det finns underlag. **Hela listan** ger ett slumpat urval.
2. Besvara några frågor och öppna **Dina framsteg** (`/app/progress`). Där syns
   **Behöver övas**, **På väg**, **Sitter bra** och nästa repetitionsdatum.
3. Prova **Öva de svåra igen** från resultatet eller framstegsvyn. Urvalet gäller
   listans aktuella svåra ord; nya ord räknas inte som svåra. Finns inga svåra
   ord får du välja ett annat urval. Få svåra ord ger ett kortare pass.
4. På föräldrasidan väljer du **Statistik och repetition** (`/admin/progress`).
   Välj lista och se aktiva/besvarade ord, senaste avslutade pass, nivåer,
   rättade svar och separat självskattning. Rapporten uppdateras när svar sparas.
5. Ändra en glosa eller ett accepterat svar. Dess nivå börjar om direkt,
   medan tidigare pass och svar finns kvar. Svar från ett redan pågående pass
   med den gamla ordversionen påverkar inte den nya versionens nivå.

Två korrekta skrivsvar höjer en nivå; enbart flerval kräver tre. Sex positiva
flashcard-bedömningar kan ge nivå 1, men självskattning kan inte höja över nivå 1.
Blandade lägen använder samma viktade regler. Fel sänker nivån ett steg och gör
ordet redo att repeteras direkt. Efter lyckade svar är intervallen 1/2/4/7 dygn
för nivå 0/1/2/3. Riktningarna delar progression. Tider visas i svensk tidszon.

Repetitionsnivåer börjar räknas med den här etappen. Äldre övningsresultat finns
kvar, men har inte räknats om till nivåer i efterhand. Datamodellen uppdateras
automatiskt av lokal Convex; ingen manuell datamigrering behövs.

## Testa glosimporten

1. Logga in och välj **Skapa gloslista**. Ange rubrik och eventuellt provdatum.
2. Klistra in glosor, exempelvis `el gato - katten`, `el perro;hunden`, eller
   läs in [exempelfilen med 20 glosor](docs/examples/glosor.csv).
3. Välj **Förhandsgranska**. Inget har ännu sparats. Rätta felrader och bekräfta
   strukturella rättelser, eller välj bort raden. Dubbletter kräver ett val.
4. Välj **Importera**, kontrollera utkastet och välj **Publicera listan**.
5. Prova att ändra en glosa, lägga till alternativa svar, inaktivera en glosa
   eller arkivera och återställa listan. **Importera fler glosor** finns längst ned.

CSV/TSV ska vara UTF-8. Citerade fält, kommatecken i fält, flerradiga fält,
engelska/svenska kolumnrubriker och omvänd språkordning stöds.
Gränser: 200 poster/import, 5 000 tecken/fält, 1 MB källtext/fil och 1 MB
serialiserad granskning. Dessutom högst 50 listor/familj, 500 glosor/lista
(även inaktiva), 2 MB ordinnehåll/lista och 10 alternativa svar/språk.
Servern kontrollerar gränser och ägarskap; importen sparas atomärt.

Granskningen ligger bara i flikens minne. Lämna inte sidan förrän sparandet
bekräftats. Ett upprepat importförsök använder samma ID och skapar inte fler
glosor. En helt ny granskning får ett nytt ID.

## Kontroller

```sh
npm run check                 # lint, typecheck, Vitest/convex-test, lokal build
npx playwright install chromium webkit
npm run test:e2e              # kräver lokal backend + setup:auth
npm audit --omit=dev
```

Playwright startar frontend om den inte redan körs. Testerna använder riktiga
lokala auth-sessioner och syntetiska vuxenkonton under `example.test`, med nya
identifierare för varje körning. Dessa stannar i den lokala databasen. Tester
spelar inte in auth-traces/video. Full `npm audit` har kända utvecklingsberoenden
att följa upp; se iterationsrapporten.

Utan `.env.local` kan `npm run dev` visa intro och konfigurationsmeddelande.
Privata sidor och auth-API öppnas inte i detta läge.

## Struktur

- `src/app/`: App Router, layout, svenska sidor och fel-/laddningslägen.
- `src/components/`: shadcn-komponenter, auth-formulär och providers.
- `src/components/admin/`: listöversikt, importgranskning och redigering.
- `src/lib/vocabulary/`: gemensam parser och validering för klient och server.
- `src/components/practice/`: övningsstart, pass, feedback och resultat.
- `src/components/progress/`: elevöversikt, repetitionsförslag och föräldrarapport.
- `src/lib/practice/`: rena, deterministiska repetitionsregler.
- `src/proxy.ts`: Convex Auths Next.js-integration och route-omdirigering.
- `convex/`: auth, schema, serverbehörighet, listor, import och atomära övningspass.
- `scripts/`: lokalt miljöskydd och nyckelkonfiguration.
- `tests/`: parser, auth-policy, Convex-behörighet/import och webbläsartester.

Läs [Etapp 3-resultatet](docs/iterations/ITERATION_3_RESULT.md) för implementation,
tester och begränsningar. Tidigare rapporter bevarar auth-utredningen och
historiken för [Etapp 0](docs/iterations/ITERATION_0_RESULT.md) och
[Etapp 1](docs/iterations/ITERATION_1_RESULT.md) och
[Etapp 2](docs/iterations/ITERATION_2_RESULT.md). Publik föräldraonboarding,
e-postverifiering/återställning och separat elevinloggning är inte aktiverade.

CI och verifieringen använder npm med `package-lock.json`. Befintlig
`pnpm-lock.yaml` har också uppdaterats för de nya beroendena; blanda inte
pakethanterare i samma `node_modules`.
