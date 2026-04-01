const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly"
];

const TOKEN_EXPIRY_BUFFER_SECONDS = 60;

export type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_at?: Date | null;
  scopes?: string[];
};

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function validateGoogleOAuthConfig() {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  // Skip validation if Google OAuth is not configured (optional in development)
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) {
    console.warn("Google OAuth not configured - calendar connector will be disabled");
    return;
  }
  getGoogleOAuthConfig();
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID is required");
  }
  if (!clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_SECRET is required");
  }
  if (!redirectUri) {
    throw new Error("GOOGLE_OAUTH_REDIRECT_URI is required");
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGoogleAuthUrl(params: {
  state: string;
  redirectUri: string;
  scopes: string[];
}): string {
  const { state, redirectUri, scopes } = params;
  const { clientId } = getGoogleOAuthConfig();

  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);

  return url.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenResponse> {
  const { code, redirectUri } = params;
  const { clientId, clientSecret } = getGoogleOAuthConfig();

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error("Google token exchange failed");
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!payload.access_token) {
    throw new Error("Google token exchange did not return access token");
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: toExpiryDate(payload.expires_in),
    scopes: payload.scope ? payload.scope.split(" ").filter(Boolean) : undefined
  };
}

export async function refreshAccessToken(params: {
  refreshToken: string;
}): Promise<GoogleTokenResponse> {
  const { refreshToken } = params;
  const { clientId, clientSecret } = getGoogleOAuthConfig();

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    throw new Error("Google token refresh failed");
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!payload.access_token) {
    throw new Error("Google token refresh did not return access token");
  }

  return {
    access_token: payload.access_token,
    expires_at: toExpiryDate(payload.expires_in),
    scopes: payload.scope ? payload.scope.split(" ").filter(Boolean) : undefined
  };
}

function toExpiryDate(expiresIn?: number) {
  if (!expiresIn) {
    return null;
  }
  const bufferedSeconds = Math.max(expiresIn - TOKEN_EXPIRY_BUFFER_SECONDS, 0);
  return new Date(Date.now() + bufferedSeconds * 1000);
}
