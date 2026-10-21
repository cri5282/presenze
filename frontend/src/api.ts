// Compatibilità: i componenti importano `api` da qui, ma l'implementazione
// ora usa Firebase Authentication e Cloud Firestore.
export { api, friendlyError } from "./data";
