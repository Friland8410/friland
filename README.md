# Andelsforeningen Friland – Årsregnskab

Webapp med årsregnskab for Andelsforeningen Friland. Indeholder resultatopgørelse og formueopgørelse, med mulighed for at hente data fra e-conomic.

## Start applikationen

```bash
npm install
npm start
```

Åbn http://localhost:3000 i browseren.

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

Vælg regnskabsår og klik på **"Hent fra e-conomic"**. Kontoplan med totaler vises i en separat sektion under det statiske årsregnskab.
