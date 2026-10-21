import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, ShieldCheck } from "lucide-react";
import { LogoMark } from "../components/Logo";

const LAST_UPDATED = "21 ottobre 2026";
const controller =
  import.meta.env.VITE_DATA_CONTROLLER?.trim() || "il gestore di questa istanza Registro";
const contact = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim();

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-glow" aria-hidden="true" />
      <header className="legal-top">
        <Link to="/" className="legal-brand">
          <LogoMark size={40} />
          <span>Registro</span>
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
          Registro è un registro condiviso delle lezioni. Questa informativa spiega quali dati
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
            <p>Per esercitare i tuoi diritti, contatta il gestore dell'istanza Registro.</p>
          )}
          <p>
            Se usi Registro nell'ambito di un'attività scolastica, possono applicarsi anche le
            informative e le policy della tua scuola.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Quali dati trattiamo</h2>
          <ul>
            <li>
              <strong>Dati dell'account</strong>: username, nome e cognome, ruolo e stato
              dell'account. Le credenziali sono gestite da Firebase Authentication; le password
              non sono salvate nell'app. L'amministratore imposta la password iniziale e può
              reimpostarla, ma non può leggerla dopo che l'utente l'ha cambiata.
            </li>
            <li>
              <strong>Eventi del calendario condiviso</strong>: titolo, data e ora, luogo,
              descrizione e link degli eventi importati dal calendario Google scelto
              dall'amministratore. L'app accede a Google Calendar esclusivamente in{" "}
              <strong>sola lettura</strong>.
            </li>
            <li>
              <strong>Presenze</strong>: stato (presente, assente), eventuale nota e
              orari facoltativi di entrata e uscita che inserisci tu.
            </li>
            <li>
              <strong>Dati tecnici</strong>: sessione Firebase, log tecnici e informazioni
              necessarie a erogare il servizio e prevenire abusi.
            </li>
            <li>
              <strong>Token Google</strong>: l'amministratore ottiene un token di accesso
              temporaneo nel proprio browser per leggere il calendario. Il token resta in memoria
              per la durata della sessione e non viene salvato su un server né su Firestore.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Finalità e base giuridica</h2>
          <p>I dati sono trattati per:</p>
          <ul>
            <li>mostrarti le lezioni importate dal calendario condiviso;</li>
            <li>registrare le tue presenze e calcolare le tue statistiche personali;</li>
            <li>mantenere la sessione e sincronizzare il calendario su comando dell'amministratore;</li>
            <li>garantire la sicurezza e il corretto funzionamento del servizio.</li>
          </ul>
          <p>
            La base giuridica è il consenso che esprimi autorizzando l'accesso a Google Calendar
            (solo per l'amministratore) e, per i dati necessari a erogare il servizio,
            l'esecuzione del servizio richiesto. Puoi revocare il consenso in qualsiasi momento
            cancellando l'account o revocando l'accesso dall'account Google.
          </p>
        </section>

        <section className="legal-section legal-highlight">
          <h2>
            <ShieldCheck size={18} /> 4. Uso dei dati Google
          </h2>
          <p>
            L'uso da parte di Registro delle informazioni ricevute dalle API Google rispetta la{" "}
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
            <li>l'app non crea, modifica o cancella eventi sul calendario;</li>
            <li>solo l'amministratore collega Google; gli altri utenti non autorizzano Google.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Conservazione e cancellazione</h2>
          <p>
            I dati restano associati al tuo account finché lo usi. Puoi eliminare definitivamente
            l'account e tutti i dati collegati da <strong>Impostazioni → Eliminazione account</strong>.
          </p>
          <p>
            La cancellazione rimuove profilo, presenze, username e mappatura di accesso. Se
            l'account viene eliminato dall'amministratore, il record di autenticazione Firebase
            può essere conservato senza profilo e senza alcun accesso ai dati dell'app; verrà
            rimosso secondo le politiche del progetto Firebase.
          </p>
          <p>
            Eventuali copie di backup possono conservare i dati per il periodo necessario al
            ripristino. I log tecnici sono conservati per il tempo necessario alla gestione della
            sicurezza.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Cookie e memoria locale</h2>
          <p>
            Registro non usa cookie pubblicitari, analytics o tracker di terze parti. Firebase
            Authentication conserva la sessione nel browser (IndexedDB/localStorage) per mantenere
            l'accesso; la rimozione dei dati del sito o il logout interrompono la sessione.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Destinatari e trasferimenti</h2>
          <p>
            I dati sono conservati su Google Firebase (Authentication e Cloud Firestore) e gli
            eventi provengono da Google Calendar. Google agisce come fornitore del servizio secondo
            le proprie condizioni e garanzie. Non vendiamo né cediamo i dati a terzi per finalità
            commerciali.
          </p>
          <p>
            Se i fornitori si trovano fuori dallo Spazio economico europeo, il trasferimento
            avviene secondo le garanzie previste dalla normativa applicabile.
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
            L'accesso usa Firebase Authentication con username e password. Le regole di sicurezza
            di Firestore impediscono agli utenti di leggere o modificare le presenze altrui;
            l'amministratore può consultarle. Il sito è servito in HTTPS tramite GitHub Pages.
            L'accesso a Google Calendar è limitato all'amministratore e in sola lettura.
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
          Registro è uno strumento personale e non sostituisce il registro ufficiale della scuola.
          Le presenze inserite nell'app non hanno valore certificativo.
        </p>
      </main>

      <p className="legal-footer">
        <Link to="/">Registro</Link> · Informativa privacy
      </p>
    </div>
  );
}
