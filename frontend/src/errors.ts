import { FirebaseError } from "firebase/app";

const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Username o password non corretti.",
  "auth/invalid-login-credentials": "Username o password non corretti.",
  "auth/user-not-found": "Username o password non corretti.",
  "auth/wrong-password": "Username o password non corretti.",
  "auth/too-many-requests": "Troppi tentativi. Attendi qualche minuto e riprova.",
  "auth/network-request-failed": "Connessione non disponibile. Controlla la rete e riprova.",
  "auth/requires-recent-login": "Per questa operazione devi reinserire la password attuale.",
  "auth/weak-password": "La nuova password è troppo debole: usa almeno 10 caratteri.",
  "auth/email-already-in-use": "Questo account esiste già. Riprova o contatta l'amministratore.",
  "auth/operation-not-allowed": "Il provider Email/Password non è abilitato nel progetto Firebase.",
  "auth/user-disabled": "Questo account è stato disabilitato.",
  "auth/unauthorized-domain": "Questo dominio non è autorizzato in Firebase Authentication.",
  "auth/invalid-api-key": "La configurazione Firebase non è valida. Contatta l'amministratore.",
  "auth/configuration-not-found": "Il progetto Firebase non è configurato correttamente.",
  "auth/popup-closed-by-user": "Finestra Google chiusa prima di completare l'accesso.",
  "auth/cancelled-popup-request": "Richiesta Google annullata. Riprova.",
  "permission-denied": "Non hai i permessi per questa operazione.",
  "unavailable": "Firebase non raggiungibile. Controlla la connessione e riprova.",
  "failed-precondition": "Manca un indice Firestore. Contatta l'amministratore.",
};

export function friendlyError(error: unknown, fallback = "Operazione non riuscita."): string {
  if (error instanceof FirebaseError) {
    return AUTH_MESSAGES[error.code] || error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return AUTH_MESSAGES[error.message] || error.message;
  }
  return fallback;
}
