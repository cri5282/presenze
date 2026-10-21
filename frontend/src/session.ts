let sessionUsername: string | null = null;

export function setSessionUsername(username: string | null): void {
  sessionUsername = username;
}

export function getSessionUsername(): string | null {
  return sessionUsername;
}

export function requireSessionUsername(): string {
  if (!sessionUsername) {
    throw new Error("Sessione non valida: effettua di nuovo l'accesso.");
  }
  return sessionUsername;
}
