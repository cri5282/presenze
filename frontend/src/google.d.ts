interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }): GoogleTokenClient;
}

interface GoogleAccounts {
  oauth2: GoogleOAuth2;
}

interface GoogleApiGlobal {
  accounts: GoogleAccounts;
}

interface Window {
  google?: GoogleApiGlobal;
}
