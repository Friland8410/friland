# Andelsforeningen Friland – Årsregnskab

Webapp med årsregnskab for Andelsforeningen Friland. Resultatopgørelse hentes fra e-conomic.

## Start applikationen

```bash
npm install
npm start
```

Du bør se `*** Friland kører på http://localhost:3000 ***` i terminalen. Åbn derefter **http://localhost:3000** i din browser.

**Hvis der ikke sker noget:**
1. Prøv `node server.js` direkte (i stedet for `npm start`)
2. Prøv en anden port: `PORT=3001 node server.js` → åbn http://localhost:3001
3. Test om serveren kører: åbn http://localhost:3000/api/ping – du bør se `{"ok":true,"msg":"Serveren kører"}`

## e-conomic integration

Appen henter regnskabsdata fra e-conomics REST API via en backend-proxy.

### Opsætning

1. Opret en `.env` fil (kopiér fra `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. **Demo-mode** (ingen konto nødvendig):  
   Brug `demo` for begge tokens – du får adgang til e-conomics demo-data.

3. **Produktion** (din egen e-conomic):
   - Opret en app på [e-conomic Developer](https://www.e-conomic.com/developer/connect)
   - Sæt `ECONOMIC_APP_SECRET_TOKEN` til din AppSecretToken
   - Brug Installation URL til at få AgreementGrantToken fra brugeren, og sæt `ECONOMIC_AGREEMENT_GRANT_TOKEN`

### Brug

Vælg regnskabsår og klik på **"Hent fra e-conomic"**. Resultatopgørelsen opdateres med data fra e-conomic.

### Verificer mapping

Klik på **"Verificer mapping"** for at sammenligne e-conomic med Excel-reference (regnskab-2025.json). Dette tjekker at de korrekte konti hentes fra e-conomic. Excel bruges kun som reference – tal vises kun fra e-conomic. Bemærk: Excel og e-conomic skal have samme regnskabsperiode (fx 01.03.25–28.02.26). Hvis e-conomic bruger kalenderår, vil tallene ikke matche.

### Tilpasning af kontomapping

Mappingen ligger i `arsregnskab-struktur.js`. Her mappes Frilands kontonumre (1010, 1020, 1310, 1320 osv.) til årsregnskabets poster. Kontrollér at e-conomic har samme kontoplan – ellers tilpas `konti`-arrayet for hver post.
