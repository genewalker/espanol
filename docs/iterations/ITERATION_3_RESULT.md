# Etapp 3 – Repetition och statistik

Datum: 2026-10-14. Status: implementerad och verifierad lokalt.

## Omfattning och beslut

Hela `GLOSAVENTYRET_MVP_PRD.md` lästes inför arbetet. Etappen omfattar FR-06,
statistiken i FR-08 och versionsåterställningen i FR-03. Inga produktionsmiljöer,
nya externa tjänster, beroenden eller autentiseringsmetoder har tillkommit.

Tidigare beslut gäller: **Convex Auth**, en föräldrainloggning och en övervakad
övningsprofil per familj. `profileId` avser `learnerProfiles`, inte ett separat
barnkonto. Föräldern ska vara närvarande; visningsläget ger ingen ny rollgräns.
Separat elevinloggning och publik kontoregistrering förblir avstängda.

XP, märken, bossutmaning och release ingår inte. Arbetet stannar efter Etapp 3.

## Implementerat

- `wordProgress` sparar progression per profil, ord och aktuell ordversion.
- Varje första giltiga svar uppdaterar svaret, passets räknare och ordets
  progression i **samma Convex-mutation**. Samma frågesvar kan inte räknas två
  gånger vid parallella anrop, omladdning eller retry.
- Pass kan väljas som **Rekommenderat**, **Svåra ord** eller **Hela listan**.
- Övningsstarten visar ett rekommenderat pass och antal repetitionsord, nya ord
  och ord som sitter bra för den senast använda publicerade listan (annars den
  första tillgängliga listan). Ett pågående pass prioriteras fortsatt.
- `/app/progress` visar aktiva ord, nivågrupper, senaste övning, nästa
  repetitionsdatum och separat självskattning för vald publicerad lista.
- `/admin/progress` visar samma statistik med båda språken, även för förälderns
  utkast och arkiverade listor. Senaste **avslutade** passets rätt/fel visas som
  antal och heltalsprocent för objektivt rättade frågor. Flashcards visas som
  antal självbedömningar, aldrig som en objektiv rättprocent.
- Resultatsidan och framstegsvyn länkar till **Öva de svåra igen**.
- Tomma urval, avsaknad av profil, inga aktiva ord och inga avslutade pass har
  svenska förklaringar. Ett tomt svårt urval kan ändras utan omladdning.

## Repetitionsregler

Reglerna finns i `src/lib/practice/repetition.ts` och tar explicit `now` för
deterministiska tester. Produktionens skrivningar och passurval använder
serverns `Date.now()`; klienten skickar inte tid, nivå eller rättningsresultat.

| Händelse | Effekt |
| --- | --- |
| Nytt ord / ny innehållsversion | Nivå 0, inga försök, redo att öva |
| Korrekt skrivsvar | 3 poäng mot nästa nivå |
| Korrekt flerval | 2 poäng mot nästa nivå |
| Flashcard `Kunde` | 1 poäng mot nästa nivå; får bara höja nivå 0 till 1 |
| 6 poäng | Höj en nivå, högst 3, och nollställ poängen |
| Fel / flashcard `Behöver öva` | Sänk en nivå, lägst 0; nollställ följd och poäng; repetition nu |

Poängen ovan är intern viktning för repetition, **inte XP**. Enbart skrivsvar
kräver två korrekta svar per höjning, flerval tre, flashcards sex för nivå 1.
Poäng från blandade övningslägen kan kombineras. När självskattning inte får
höja nivån sparas högst fem poäng; en objektiv fråga behövs för fortsatt höjning.
Nivåer som tidigare nåtts med objektiva svar sänks inte av ett positivt flashcard.

Efter ett positivt svar blir nästa intervall:

| Nivå | Grupp | Intervall |
| --- | --- | --- |
| 0 | Behöver övas | 1 dygn |
| 1 | På väg | 2 dygn |
| 2 | På väg | 4 dygn |
| 3 | Sitter bra | 7 dygn |

Intervallen är UTC-dygn om 86 400 000 ms. Presentation använder `sv-SE` och
`Europe/Stockholm`, även över sommar-/vintertidsbyte. Nivåerna är ett enkelt
övningsstöd och inte ett validerat kunskapsmått.

`attempts` räknar alla svar i aktuell version. `correct`/`wrong` räknar endast
objektivt rättade svar; `selfKnown`/`selfAgain` räknar flashcards separat.
`consecutiveCorrect` räknar positiva utfall i följd, inklusive självskattning.
Båda språkriktningarna delar ordets progression, enligt PRD:ns modell per ord.
Ett flerval som faller tillbaka till skrivning får skrivövningens vikt.

## Urval, tid och dubbletter

- **Rekommenderat:** först upp till 60 % förfallna/svåra ord, sedan nya ord upp
  till passlängden. Fyll vid brist från återstående repetitionsord och därefter
  övriga ord. Förfallna ord prioriteras före ännu ej förfallna svåra ord; därefter
  lägre nivå och äldre repetitionsdatum. Inga slumpmässiga datum eller cronjobb.
- **Svåra ord:** tidigare besvarade ord som är på nivå 0 eller vars senaste
  utfall var negativt. Helt nya ord ingår inte. Urvalet gäller hela listan,
  inte enbart det senaste passets felsvar.
- **Hela listan:** slumpat urval av listans aktiva, unika uttryck.
- Avsiktligt behållna dubblettrader har egna progressposter. Vid samma uttryck
  prioriteras den minst övade raden mellan passen; i svårt urval prioriteras en
  svår rad. Samma normaliserade uttryckspar frågas högst en gång i varje pass.
- Distraktorer hämtas från hela den aktuella listans unika uttryck, också när
  själva repetitionsurvalet bara har ett ord. Detta undviker onödig fallback.
- `selection` ingår i startförsökets idempotensnyckel. Gamla sessioner utan
  fältet fortsätter fungera, och deras sparade frågeplaner ändras inte.

Rapportqueries returnerar lagrade datum utan tidsbaserad databasfiltrering.
Gränssnittets klocka uppdaterar visningen ungefär varje minut; ett nyss sparat
felsvar visas direkt som förfallet med hjälp av dess serverstämplade övningstid.
Visningsklockan kan påverkas av enhetens klocka, men påverkar aldrig sparade
datum eller serverns passurval. Ingen bakgrundspollning eller schemalagd mutation
krävs för att ett ord ska bli repetitionsaktuellt.

## Ordändringar och befintliga data

Ändrad grundtext eller accepterade svar ökar `contentVersion` och återställer
den befintliga progressposten atomärt. Oförändrat innehåll återställer inte.
Queries och urval försvarar sig dessutom mot versionsmismatch genom att visa
ordet som nytt. Ett svar från en gammal frågesnapshot rättas fortfarande enligt
snapshoten, men kan inte återställa progression för den gamla versionen.

Historiska `practiceAnswers`, `practiceQuestions` och passresultat bevaras.
Inaktiva ord visas inte i aktuell progress eller nya pass. Återaktivering
bevarar progress om innehållsversionen är densamma. Arkivering stoppar övning
men förälderns rapport och tidigare resultat finns kvar.

**Ingen retroaktiv omräkning av Etapp 2-svar.** Befintliga pass finns kvar och
kan visas som senaste avslutade pass, men nya repetitionsnivåer börjar från
nya svar efter införandet. Detta framgår i gränssnittet och README. Schemaändringen
är additiv: ny tabell, nytt index och ett valfritt sessionsfält. Inga data har
raderats eller krävts migrerade manuellt.

## Arkitektur och säkerhet

- `wordProgress` indexeras med `by_profile_word` och `by_profile_list`.
  Logisk unikhet säkras med indexuppslag + skrivning i samma mutation.
- `practiceSessions.by_profile_list_status_completed` hämtar senaste avslutade
  passet utan att läsa hela historiken. Avbrutna pass ersätter inte detta värde.
- Rapporten läser en lista åt gången, högst 500 aktiva ord och 500 progressposter.
  Listväljaren är begränsad av befintliga 50 listor per familj. Ingen obunden
  `collect()` eller databasskanning med `.filter()` har införts i backend.
- Båda nya queries har explicita argument-/returvalidators och kontrollerar
  serverns lagrade roll, aktuell auth-session och listägare. Övningsrapporten
  kräver dessutom profil och publicerad lista. Andra familjer och de avstängda
  elevrollerna nekas. Klienten väljer aldrig auktoritativt profil-ID.
- Övningsrapporten utelämnar spansk grundtext och accepterade svar. Förälderns
  rapport får visa ordparet. Frågesnapshots, hemliga alternativ-ID:n och aliases
  ingår inte i rapportpayloads. Reservmodellens föräldraroll har fortfarande
  föräldraåtkomst; detta är inte en separat säkerhetsgräns mot kontoinnehavaren.
- Den tidigare sessionsrättningen behålls och regressionstestas. Ingen ny
  egen autentisering eller tokenhantering har lagts till.

## Filer

- Nytt: `convex/progress.ts`, `convex/lib/progress.ts`,
  `convex/lib/progressModel.ts`, `src/lib/practice/repetition.ts`.
- Ändrat: `convex/schema.ts`, `convex/practice.ts`, `convex/words.ts`,
  `convex/lib/practiceModel.ts`, `convex/lib/practicePlan.ts` och genererade API-typer.
- Nytt: `src/app/app/progress/page.tsx`, `src/app/admin/progress/page.tsx`,
  `src/components/progress/overview.tsx`.
- Ändrat: navigering, övningsstart, listval, resultat och README.
- Tester: `tests/repetition.test.ts`, `tests/progress-backend.test.ts`,
  `tests/e2e/progress.spec.ts`.

## Verifiering

| Kontroll | Resultat |
| --- | --- |
| `npm run check` | Godkänt: lint, frontend-/backendtyper, 101 tester i 8 filer och lokal build |
| Lokal Convex-codegen/push med `localEnvironment()` | Godkänt, schema och funktioner uppladdade enbart till lokal backend |
| `npm run test:e2e` | 44/44 godkända, Chromium och mobil WebKit |
| Nya repetitions-/backendtester | 24 nya jämfört med Etapp 2: totalen ökade från 77 till 101 |
| Mobil och tillgänglighet | 320 px utan horisontell overflow, minst 44 px listväljare och inga axe-fel i de nya testade vyerna |
| Visuell granskning | Syntetisk föräldrarapport med alla tre nivågrupper vid 390 px granskad |

Tester täcker deterministiska intervall, viktning, nivåtak, felutfall,
sommar-/vintertid, 60/40-urval, urvalsbrist, dubbletter, riktningar, riktig
flervalströskel, fallback, självskattning, atomära retries, samtidig ordändring
och svar, gammal snapshot, oförändrad/ändrad text, inaktivering/arkivering,
separerade familjer, utgången session, manipulerade argument och historiska resultat.

Webbläsartester går från riktiga lokala sessioner via övning till elevöversikt
och föräldrarapport, även med omladdning och reaktiv uppdatering efter redigering.
Ett nytt Safari-test behövde invänta resultatnavigationen innan det navigerade
vidare. Den visuella granskningen fångade även minutklockans fördröjning för ett
nytt felsvar; slutlösningen använder senaste serverstämplade övningstid som
lägsta visningstid, med en separat webbläsarassertion för omedelbart repetitionsbehov.

En kompletterande körning av de sex nya webbläsartesterna verifierar den sista
visningsjusteringen. Inga auth-traces, lösenord eller tokens har sparats i repo.
Syntetiska testkonton och deras data finns kvar i den lokala databasen.

## Kvarstående begränsningar

- Ingen separat elevinloggning; föräldern ska vara närvarande.
- Ingen FSRS eller validerad pedagogisk modell. Samma glosa kan övas i nya pass
  direkt; inget krav på väntetid för att ett korrekt tillfälle ska räknas.
- Statistik och repetition visas per lista, inte som en sammanslagen
  familjeanalys över alla listor. De två språkriktningarna delar nivå.
- Äldre svar har inte fått retroaktiva repetitionsnivåer.
- Inga nya externa konfigurationshinder identifierades. Befintliga krav inför
  familjepilot/publik lansering kvarstår: säker kontolivscykel, verifierade
  leverantörsvillkor, backup/export och raderingsrutin. Raderingen behöver nu
  även omfatta `wordProgress` för profilen.
- Ingen fysisk mobiltest eller nätlatensgaranti; testerna använder lokal
  backend och emulerad mobil WebKit. Ingen offlinefunktion införs.

## Källor och nästa steg

Implementation och granskning följde projektets `AGENTS.md`, installerad
Next.js-dokumentation för `page`/`searchParams` och Convex-/React-skillernas
checklistor. Aktuella primärkällor kontrollerades:

- [Convex: transaktionella mutationer](https://docs.convex.dev/functions/mutation-functions)
- [Convex: index och läsning](https://docs.convex.dev/database/reading-data/indexes/)

Nästa etapp är **Etapp 4 – Spelifiering och polish**, efter användarens besked.
Ingen del av Etapp 4 har startats.
