import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { LogoMark } from "../components/Logo";

interface PrivacyInfo {
  data_controller?: string;
  contact_email?: string;
}

const LAST_UPDATED = "21 ottobre 2026";

export default function PrivacyPage() {
  const [info, setInfo] = useState<PrivacyInfo>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (alive && data?.privacy) setInfo(data.privacy);
      })
      .catch(() => {
        // La pagina resta leggibile anche se il backend non è raggiungibile.
      });
    return () => {
      alive = false;
    };
  }, []);

  const controller = info.data_controller?.trim() || "il gestore di questa istanza Presenze";
  const contact = info.contact_email?.trim();

  return (
    <div className="legal-page">
      <div className="legal-glow" aria-hidden="true" />
      <header className="legal-top">
        <Link to="/" className="legal-brand">
          <LogoMark size={40} />
          <span>Presenze</span>
        </Link>
        <Link to="/" className="button button-ghost button-small">
          <ArrowLeft size={15} /> Torna all'app
        </Link>
      </header>

      <main className="legal-card">
        <p className="eyebrow">Informativa privacy</p>
        <h1>Come trattiamo i tuoi dati</h1>
        <p className="legal-meta">Ultimo aggiornamento: {LAST_UPDATED}</p>

        <p className="legal-intro">
          Presenze è un registro personale delle lezioni. Questa informativa spiega quali dati
          vengono trattati, perché, per quanto tempo e come puoi esercitare i tuoi diritti.
        </p>

        <section className="legal-section">
          <h2>1. Titolare del trattamento</h2>
          <p>
            Il titolare del trattamento è <strong>{controller}</strong>.
          </p>
          {contact ? (
            <p>
              Per richieste relative alla privacy puoi scrivere a{" "}
              <a href={`mailto:${contact}`}>{contact}</a>.
            </p>
          ) : (
            <p>Per esercitare i tuoi diritti, contatta il gestore dell'istanza Presenze.</p>
          )}
          <p>
            Se usi Presenze nell'ambito di un'attività scolastica, possono applicarsi anche le
            informative e le policy della tua scuola.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Quali dati trattiamo</h2>
          <ul>
            <li>
              <strong>Dati dell'account Google</strong>: identificativo Google, nome, indirizzo
              email e immagine del profilo. Servono per creare e proteggere il tuo account.
            </li>
            <li>
              <strong>Eventi del calendario</strong>: titolo, data e ora, luogo, descrizione e link
              degli eventi dei calendari che scegli di importare. L'app accede a Google Calendar
              esclusivamente in <strong>sola lettura</strong>.
            </li>
            <li>
              <strong>Presenze</strong>: stato (presente, assente, giustificato), eventuale nota e
              orari facoltativi di entrata e uscita che inserisci tu.
            </li>
            <li>
              <strong>Dati tecnici</strong>: cookie di sessione, stato OAuth temporaneo e log del
              server necessari per erogare il servizio e prevenire abusi.
            </li>
            <li>
              <strong>Token Google</strong>: il refresh token è conservato cifrato sul server e non
              viene mai inviato al browser.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Finalità e base giuridica</h2>
          <p>I dati sono trattati per:</p>
          <ul>
            <li>mostrarti le lezioni importate dal calendario che hai scelto;</li>
            <li>registrare le tue presenze e calcolare le tue statistiche personali;</li>
            <li>mantenere la sessione e sincronizzare i calendari su tuo comando;</li>
            <li>garantire la sicurezza e il corretto funzionamento del servizio.</li>
          </ul>
          <p>
            La base giuridica è il consenso che esprimi autorizzando l'accesso a Google Calendar e,
            per i dati necessari a erogare il servizio, l'esecuzione del servizio richiesto. Puoi
            revocare il consenso in qualsiasi momento cancellando l'account o revocando l'accesso
            dall'account Google.
          </p>
        </section>

        <section className="legal-section legal-highlight">
          <h2>
            <ShieldCheck size={18} /> 4. Uso dei dati Google
          </h2>
          <p>
            L'uso da parte di Presenze delle informazioni ricevute dalle API Google rispetta la{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy <ExternalLink size={12} />
            </a>
            , inclusi i requisiti di <strong>Limited Use</strong>.
          </p>
          <ul>
            <li>i dati Google Calendar sono usati solo per mostrarti gli eventi e le statistiche;</li>
            <li>non sono venduti, affittati o condivisi con inserzionisti;</li>
            <li>non sono usati per pubblicità o per addestrare modelli di intelligenza artificiale;</li>
            <li>l'app non crea, modifica o cancella eventi sul tuo calendario.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Conservazione e cancellazione</h2>
          <p>
            I dati restano associati al tuo account finché lo usi. Puoi eliminare definitivamente
            l'account e tutti i dati collegati da <strong>Impostazioni → Eliminazione account</strong>.
          </p>
          <p>
            La cancellazione rimuove profilo, eventi importati, presenze, stati di sincronizzazione
            e token Google conservati sul server. Il token viene anche revocato presso Google, se
            ancora valido. L'operazione non è reversibile.
          </p>
          <p>
            Eventuali copie di backup possono conservare i dati per il periodo necessario al
            ripristino, secondo la configurazione del server. I log tecnici sono conservati per il
            tempo necessario alla gestione della sicurezza.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Cookie</h2>
          <p>Presenze usa solo cookie tecnici, necessari al funzionamento:</p>
          <ul>
            <li>
              <code>presenze_session</code>: mantiene la sessione per un massimo di 30 giorni;
            </li>
            <li>
              <code>presenze_oauth_state</code>: protegge il login Google e dura pochi minuti.
            </li>
          </ul>
          <p>Non usiamo cookie pubblicitari, analytics o tracker di terze parti.</p>
        </section>

        <section className="legal-section">
          <h2>7. Destinatari e trasferimenti</h2>
          <p>
            I dati sono conservati sul server che ospita l'istanza. Possono essere trattati dal
            fornitore di hosting e da Google per le funzioni di autenticazione e Calendar. Non
            vendiamo né cediamo i dati a terzi per finalità commerciali.
          </p>
          <p>
            Se il server o i fornitori si trovano fuori dallo Spazio economico europeo, il
            trasferimento avviene secondo le garanzie previste dalla normativa applicabile.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. I tuoi diritti</h2>
          <p>
            Puoi chiedere accesso, rettifica, cancellazione, limitazione, opposizione e portabilità
            dei dati, oltre alla revoca del consenso. La cancellazione è disponibile direttamente
            nelle impostazioni dell'app.
          </p>
          {contact ? (
            <p>
              Per esercitare i diritti scrivi a <a href={`mailto:${contact}`}>{contact}</a>. Hai
              inoltre il diritto di proporre reclamo all'autorità di controllo competente.
            </p>
          ) : (
            <p>
              Per esercitare i diritti contatta il gestore dell'istanza. Hai inoltre il diritto di
              proporre reclamo all'autorità di controllo competente.
            </p>
          )}
        </section>

        <section className="legal-section">
          <h2>9. Sicurezza</h2>
          <p>
            L'accesso avviene tramite Google OAuth. La sessione è protetta da un cookie HttpOnly e,
            in produzione, l'app deve essere servita in HTTPS. Ogni utente vede solo i propri
            eventi e le proprie presenze; il refresh token Google è cifrato a riposo.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Modifiche</h2>
          <p>
            Questa informativa può essere aggiornata se cambiano le funzionalità o gli obblighi
            applicabili. La data in cima alla pagina indica l'ultima versione.
          </p>
        </section>

        <p className="legal-note">
          Presenze è uno strumento personale e non sostituisce il registro ufficiale della scuola.
          Le presenze inserite nell'app non hanno valore certificativo.
        </p>
      </main>

      <p className="legal-footer">
        <Link to="/">Presenze</Link> · Informativa privacy
      </p>
    </div>
  );
}
