# edge-browse-minutes

A Microsoft Rewards **"Edge â€“ Minutes: 0/30"** kÃ¡rtyÃ¡t tÃ¶lti fel: elindÃ­tja a **valÃ³di Edge-et** egy dedikÃ¡lt profillal,
CDP-n keresztÃ¼l vezÃ©rli (bÃ¶ngÃ©szÃ©s, gÃ¶rgetÃ©s), Ã©s kÃ¶zben a Rewards flyout API-bÃ³l olvassa a percszÃ¡mlÃ¡lÃ³t.

A [TheNetsky/Microsoft-Rewards-Script](https://github.com/TheNetsky/Microsoft-Rewards-Script) ezt szÃ¡ndÃ©kosan nem
csinÃ¡lja: a percet nem egy hÃ­vhatÃ³ Rewards API adja, hanem az Edge belsÅ‘ telemetriÃ¡ja kÃ¼ldi. EzÃ©rt itt nem Playwright
indÃ­tja a bÃ¶ngÃ©szÅ‘t â€” a Playwright alapÃ©rtelmezett kapcsolÃ³i (`--disable-background-networking`, `--disable-sync`, â€¦)
pont ezt a telemetriÃ¡t lÅ‘nÃ©k ki. Helyette az Edge sima folyamatkÃ©nt indul `--remote-debugging-port`-tal, Ã©s utÃ³lag
csatlakozunk rÃ¡.

## FeltÃ©telek

- Windows + telepÃ­tett Microsoft Edge
- Node.js 20+
- **Be kell jelentkezni magÃ¡ba az Edge-be** (profil ikon, jobb felÃ¼l), nem elÃ©g a bing.com-os belÃ©pÃ©s

## TelepÃ­tÃ©s

```bash
cd tools/edge-browse-minutes && npm install
```

## ElsÅ‘ indÃ­tÃ¡s (egyszeri bejelentkezÃ©s)

```bash
cd tools/edge-browse-minutes && node index.mjs --status
```

KinyÃ­lik az Edge a `edge-profile` mappÃ¡ban lÃ©vÅ‘ Ã¼res profillal. Jelentkezz be **az Edge-be** a Microsoft-fiÃ³kkal,
majd futtasd Ãºjra a `--status`-t: ha lÃ¡tod a `Edge browsing time: x/30 min` sort, minden Ã¡ll.

## HasznÃ¡lat

```bash
cd tools/edge-browse-minutes && node index.mjs
```

AmÃ­g a szÃ¡mlÃ¡lÃ³ el nem Ã©ri a 30-at (vagy le nem jÃ¡r a `sessionTimeoutMinutes`), az eszkÃ¶z Bing-keresÃ©seket Ã©s
MSN/hÃ­r oldalakat nyitogat, emberszerÅ±en gÃ¶rget, Ã©s percenkÃ©nt lekÃ©rdezi az Ã¡llÃ¡st. Ha kÃ©sz, bezÃ¡rja az Edge-et.

KapcsolÃ³k:

| KapcsolÃ³ | Mit csinÃ¡l |
| --- | --- |
| `--status` | Csak kiÃ­rja az aktuÃ¡lis Ã¡llÃ¡st, nem bÃ¶ngÃ©szik |
| `--dump` | A nyers Rewards JSON-t fÃ¡jlba menti (ha a szÃ¡mlÃ¡lÃ³ felismerÃ©se elromlik) |
| `--no-foreground` | Nem rÃ¡ngatja elÅ‘tÃ©rbe az Edge ablakot |

## Fontos tudnivalÃ³k

- **FÃ³kusz kell.** Az Edge csak az *aktÃ­v* bÃ¶ngÃ©szÃ©st szÃ¡molja, ezÃ©rt az eszkÃ¶z 20 mÃ¡sodpercenkÃ©nt elÅ‘tÃ©rbe hozza az
  Edge ablakot, Ã©s letiltja az alvÃ¡st. EzÃ©rt Ã©rdemes akkor futtatni, amikor nem a gÃ©pnÃ©l vagy. KikapcsolÃ¡sa:
  `keepForeground: false` a `config.json`-ban vagy `--no-foreground`.
- **Nincs garancia.** A percet a Microsoft mÃ©ri szerveroldalon; az eszkÃ¶z valÃ³di Edge-et hasznÃ¡l, de hogy a
  telemetria mit fogad el, azt a Microsoft bÃ¡rmikor vÃ¡ltoztathatja. EzÃ©rt van benne a `--dump`, hogy a JSON
  szerkezetÃ©nek vÃ¡ltozÃ¡sakor Ãºjra lehessen hangolni a `src/progress.mjs` felismerÅ‘ logikÃ¡jÃ¡t.
- **KÃ¼lÃ¶n profil.** A `edge-profile` mappa nem a napi Edge-profilod, Ã­gy nem kavar bele a szemÃ©lyes bÃ¶ngÃ©szÃ©sbe.
  Ha inkÃ¡bb a sajÃ¡t profilodat hasznÃ¡lnÃ¡d, Ã¡llÃ­tsd Ã¡t a `userDataDir`-t (ilyenkor a sajÃ¡t Edge-edet be kell zÃ¡rni,
  mielÅ‘tt ez elindul).

## KonfigurÃ¡ciÃ³

Az Ã¶sszes kulcs magyarÃ¡zata a [config.example.json](config.example.json) fÃ¡jlban van kommentkÃ©nt (`"// kulcs"` sorok).
Az elsÅ‘ futÃ¡skor ebbÅ‘l kÃ©szÃ¼l a `config.json`.
