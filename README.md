# Presenze

Registro condiviso delle presenze della classe, pubblicato come sito statico su **GitHub Pages** e basato su **Firebase Authentication + Cloud Firestore**. Il calendario delle lezioni è unico per tutti e viene importato dal Google Calendar dell'amministratore; ogni studente vede e modifica soltanto le proprie presenze.

Non serve un server applicativo, un database SQL, Cloud Functions o il piano Blaze. La sincronizzazione con Google Calendar viene eseguita dal browser dell'amministratore, su richiesta.

## Funzionalità

- Login con **username e password** creati dall'amministratore; nessun login Google per gli studenti.
- Primo accesso con cambio password obbligatorio.
- Calendario condiviso della classe, importato in sola lettura da Google Calendar.
- Presenze, assenze, giustificazioni e orari personali.
- Statistiche personali per periodo e per materia.
- Pannello amministratore: creazione singola o multipla degli account, reset password, disattivazione, eliminazione e ispezione delle presenze di ogni studente.
- Un solo amministratore; gli studenti non possono leggere né scrivere le presenze altrui.
- PWA installabile, layout responsive, informativa privacy.
- Dati reali migrati dal vecchio database SQLite tramite uno script di bootstrap.

## Architettura

```text
Browser
  ├── React + Vite + TypeScript (GitHub Pages)
  ├── Firebase Authentication (username → email sintetica)
  ├── Cloud Firestore (profili, eventi, presenze, impostazioni)
  └── Google Identity Services + Calendar API (solo admin, in memoria)
```

- **GitHub Pages** ospita solo file statici.
- **Firebase Authentication** gestisce le credenziali. Poiché l'app usa username e non email, ogni username viene mappato a un'email sintetica `username@presenze.local`.
- **Cloud Firestore** contiene tutti i dati applicativi ed è protetto da regole di sicurezza.
- **Google Calendar** viene letto dall'amministratore con un token OAuth tenuto solo in memoria nel browser. Non viene salvato su Firestore e non viene mai richiesto agli studenti.
- La sincronizzazione è **manuale**: l'amministratore preme “Sincronizza ora” da Impostazioni o dalla barra laterale.

### Modello Firestore

| Percorso | Contenuto |
| --- | --- |
| `users/{username}` | Nome, ruolo (`admin`/`user`), stato, flag cambio password, UID Auth |
| `authUids/{uid}` | Mappa UID Firebase → username |
| `loginDirectory/{username}` | Email sintetica e stato, leggibile prima del login |
| `events/{eventId}` | Eventi del calendario condiviso |
| `attendance/{username}__{eventId}` | Presenza personale |
| `settings/calendar` | Calendari scelti e ultima sincronizzazione |
| `syncState/{calendarId}` | `syncToken` Google, accessibile solo all'admin |

Le regole in [`firestore.rules`](firestore.rules) consentono agli utenti attivi di leggere il calendario condiviso e di scrivere esclusivamente le proprie presenze. L'amministratore può gestire utenti, eventi, impostazioni e sincronizzazione. I test delle regole sono in [`frontend/tests/firestore.rules.test.ts`](frontend/tests/firestore.rules.test.ts).

## Account

- L'amministratore viene creato dallo script di bootstrap. Username predefinito: `admin`. La password viene stampata dallo script o fornita con `ADMIN_PASSWORD`.
- Gli account degli studenti vengono creati dal pannello **Utenti**.
- Lo username viene ricavato da “Nome e cognome” (es. `Nicolò Simonini` → `nicolo.simonini`) e può essere indicato manualmente.
- La password iniziale è:

  ```text
  username.2026!
  ```

  Al primo accesso l'app obbliga a sceglierne una personale di almeno 10 caratteri.
- Il reset password da parte dell'amministratore crea un nuovo account Firebase Authentication, rimappa lo username e impone di nuovo il cambio password. Il vecchio account Auth perde la mappatura e quindi l'accesso ai dati.
- La disattivazione impedisce il login e l'accesso alle regole Firestore.
- L'eliminazione da parte dell'amministratore cancella profilo, presenze e mappatura. Il record Auth può restare orfano nel progetto Firebase e va ripulito dalla Console, se necessario.
- Lo studente può eliminare il proprio account da **Impostazioni → Eliminazione account**, confermando con la password.

## Sviluppo locale con gli emulatori

Requisiti: Node.js 22+, Java (per l'emulatore Firestore), Python 3 (solo per l'export).

```bash
# 1. Dipendenze frontend
cd frontend
npm ci
cd ..

# 2. Emulatori Auth + Firestore (terminale separato)
frontend/node_modules/.bin/firebase emulators:start \
  --project demo-presenze --only auth,firestore

# 3. Bootstrap: crea admin e utenti, importa i dati reali
cd scripts
npm ci
FIREBASE_PROJECT_ID=demo-presenze \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
ADMIN_PASSWORD='admin.test.2026!' \
npm run bootstrap
cd ..

# 4. App
cd frontend
npm run dev
```

Apri <http://localhost:5173>. Credenziali demo:

```text
admin / admin.test.2026!
nicolo.simonini / nicolo.simonini.2026!
```

La UI degli emulatori è su <http://127.0.0.1:4000>.

`frontend/.env.development` attiva automaticamente gli emulatori. I test delle regole cancellano i dati Firestore dell'emulatore: dopo `npm run test:rules` esegui di nuovo il bootstrap.

### Test delle regole

```bash
cd frontend
npm run test:rules
```

I test usano `@firebase/rules-unit-testing` e richiedono l'emulatore Firestore attivo sulla porta `8080`.

## Pubblicazione in produzione

### 1. Progetto Firebase

1. Crea un progetto su <https://console.firebase.google.com/>. Il piano **Spark** è sufficiente: non ci sono Cloud Functions.
2. Aggiungi un'app Web e copia i valori di configurazione.
3. Abilita **Authentication → Sign-in method → Email/Password**.
4. Crea un database **Cloud Firestore** (modalità produzione, area geografica preferita).

La configurazione web di Firebase è pubblica per progettazione: non è un segreto. Non inserire mai nel repository service account, refresh token o password.

### 2. Regole e indici

Dalla radice del repository:

```bash
frontend/node_modules/.bin/firebase login
frontend/node_modules/.bin/firebase use --add   # scegli il progetto di produzione
frontend/node_modules/.bin/firebase deploy \
  --only firestore:rules,firestore:indexes
```

### 3. Bootstrap e dati reali

Il database SQLite reale è in `backend/data/presenze.db` ed è ignorato da Git. Esportalo e importalo su Firebase:

```bash
python3 migration/export-from-sqlite.py

cd scripts
npm ci
GOOGLE_APPLICATION_CREDENTIALS=/percorso/service-account.json \
FIREBASE_PROJECT_ID=il-tuo-progetto \
ADMIN_PASSWORD='una-password-lunga-e-casuale' \
npm run bootstrap
```

Il file `migration/firebase-export.json` contiene dati personali ed è ignorato: non committarlo. Le credenziali generate vengono salvate in `migration/bootstrap-credentials.txt`, anch'esso ignorato.

Per creare un service account: Console Firebase → Impostazioni progetto → Account di servizio → Genera nuova chiave privata.

### 4. Google Calendar (solo amministratore)

1. In Google Cloud Console abilita **Google Calendar API**.
2. Configura la schermata di consenso OAuth e aggiungi lo scope:
   `https://www.googleapis.com/auth/calendar.readonly`.
3. Crea un **Client OAuth Web Application**.
4. In **Authorized JavaScript origins** aggiungi:
   - `http://localhost:5173` per lo sviluppo;
   - `https://<utente>.github.io` per GitHub Pages (senza path).
5. Non serve un redirect URI: viene usato Google Identity Services con token client.
6. In Firebase Console → Authentication → Settings → Authorized domains aggiungi `<utente>.github.io`.

L'accesso Google viene richiesto solo all'amministratore quando preme “Collega Google / carica calendari” o “Sincronizza ora”. Il token resta in memoria e non viene scritto su Firestore.

Seleziona **solo il calendario della classe**: tutti gli eventi importati sono visibili agli studenti. Non selezionare il calendario personale dell'amministratore se contiene appuntamenti privati. Il bootstrap iniziale imposta come calendari condivisi quelli da cui provengono gli eventi realmente esportati dal vecchio database.

### 5. GitHub Pages

1. Il repository deve essere **pubblico** oppure l'account deve avere **GitHub Pro**: GitHub Pages non è disponibile per repository privati sul piano gratuito.
2. In **Settings → Pages → Build and deployment** scegli **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Variables** aggiungi:

   | Variabile | Valore |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | dalla configurazione Web Firebase |
   | `VITE_FIREBASE_AUTH_DOMAIN` | idem |
   | `VITE_FIREBASE_PROJECT_ID` | idem |
   | `VITE_FIREBASE_STORAGE_BUCKET` | idem |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | idem |
   | `VITE_FIREBASE_APP_ID` | idem |
   | `VITE_GOOGLE_CLIENT_ID` | Client OAuth Web |
   | `VITE_DATA_CONTROLLER` | es. “Classe 5A — Istituto …” |
   | `VITE_PRIVACY_CONTACT_EMAIL` | email per la privacy |
   | `VITE_BASE_PATH` | facoltativa; default `/<nome-repository>/` |

4. Fai push su `main` o avvia manualmente il workflow **Deploy su GitHub Pages**.
5. L'app sarà su `https://<utente>.github.io/<repository>/`.

Il workflow [`pages.yml`](.github/workflows/pages.yml) imposta il base path, copia `index.html` in `404.html` per le route SPA e carica l'artifact su Pages.

### 6. Primo utilizzo

1. Accedi come `admin` con la password del bootstrap.
2. Cambia la password da **Impostazioni → Sicurezza**.
3. Apri **Impostazioni → Calendario condiviso**, premi “Collega Google / carica calendari”, seleziona il calendario della classe e salva.
4. Premi “Sincronizza ora”. Da quel momento gli studenti vedono gli eventi.
5. Crea gli account da **Utenti** e consegna le credenziali iniziali.

## Configurazione locale

Copia `frontend/.env.example` in `frontend/.env.local` per usare un progetto Firebase reale in sviluppo:

```bash
cd frontend
cp .env.example .env.local
# compila i valori, poi:
npm run dev
```

Per gli emulatori non serve compilare nulla: `frontend/.env.development` imposta `VITE_USE_FIREBASE_EMULATORS=true`.

## Struttura del repository

```text
.
├── .github/workflows/pages.yml     # build + deploy GitHub Pages
├── firebase.json                   # regole, indici, emulatori
├── firestore.rules
├── firestore.indexes.json
├── frontend/                       # app React/Vite
│   ├── src/firebase.ts             # inizializzazione Firebase/emulatori
│   ├── src/data.ts                 # API Firestore
│   ├── src/users.ts                # provisioning utenti
│   ├── src/googleCalendar.ts       # OAuth GIS + sync calendario
│   ├── src/pages/AdminUsers.tsx
│   ├── src/pages/AdminUser.tsx
│   └── tests/firestore.rules.test.ts
├── scripts/bootstrap-firebase.mjs  # admin + import dati
├── migration/export-from-sqlite.py
├── backend/                        # VECCHIO backend FastAPI/SQLite (legacy)
└── backend/data/presenze.db        # dati reali, ignorati da Git
```

## Limiti noti

- **GitHub Pages e repository privati**: sul piano gratuito Pages non è disponibile per repo privati. Rendere pubblico il repository o usare GitHub Pro.
- **Nessuna Cloud Function**: la creazione degli utenti avviene dal browser dell'amministratore tramite una seconda istanza Firebase. Dopo un reset o un'eliminazione, l'account Auth precedente può restare orfano e va ripulito manualmente dalla Console Firebase.
- **Cambio password al primo accesso**: è imposto dall'interfaccia e dal flag Firestore. Senza Cloud Functions non è possibile dimostrare lato server che la password sia stata effettivamente cambiata; un utente che conoscesse già la password iniziale potrebbe aggirare il flag chiamando direttamente Firestore. Le regole impediscono comunque l'accesso ai dati altrui.
- **Sincronizzazione manuale**: non c'è un job periodico. Se l'amministratore non apre l'app e non preme “Sincronizza ora”, il calendario non si aggiorna.
- **Token Google in memoria**: alla chiusura del tab l'amministratore deve riautorizzare Google alla sincronizzazione successiva.
- **CORS/Google API**: se la sincronizzazione fallisce, verificare che l'origine GitHub Pages sia tra gli Authorized JavaScript origins del client OAuth e che Google Calendar API sia abilitata.
- **PWA**: la shell viene messa in cache, ma la lettura e la scrittura dei dati richiedono la connessione.

## Vecchio backend

La cartella `backend/`, `docker-compose.yml`, `Caddyfile` e i file Docker appartengono alla precedente architettura FastAPI + SQLite. **Non vengono usati da GitHub Pages** e non sono necessari per il deploy Firebase. Sono conservati solo per esportare i dati reali con `migration/export-from-sqlite.py`.

## Convenzioni

I commit seguono i **Conventional Commits** in italiano, ad esempio:

```text
feat(frontend): aggiunge il pannello utenti Firebase
fix(rules): consente l'eliminazione del proprio account
docs: aggiorna la guida al deploy su GitHub Pages
```
