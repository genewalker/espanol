# Glosäventyret

Etapp 0: lokal foundation och en sluten auth-spike. Next.js App Router,
TypeScript, Tailwind/shadcn och Convex Auth. Inga glos- eller övningsfunktioner ännu.

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

Logga in på `/sign-in`. `/admin` visar en serverauktoriserad tom föräldrasida.
`/app` leder tills vidare till samma skyddade sida; ingen elevvy eller rollväxling
har byggts. Föräldrasessionen får endast användas under uppsikt på delad enhet.

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
- `src/proxy.ts`: Convex Auths Next.js-integration och route-omdirigering.
- `convex/`: auth, schema, serverbehörighet och publik liveness-query.
- `scripts/`: lokalt miljöskydd och nyckelkonfiguration.
- `tests/`: auth-policy, Convex-behörighet och webbläsartester.

Läs [Etapp 0-resultatet](docs/iterations/ITERATION_0_RESULT.md) för auth-beslut,
verifierade resultat, återstående hinder och gränsen mot Etapp 1.
