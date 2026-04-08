import { OAuth2Client } from "google-auth-library";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

const configuredClientIds = (
  process.env.GOOGLE_CLIENT_IDS ??
  "669658333594-qoni0sjaj1egsa5egabjb91laie0k6fi.apps.googleusercontent.com"
)
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const googleClient = new OAuth2Client();

interface GoogleTokenInfoResponse {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string;
  name?: string;
}

function parseBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

export async function authenticateRequest(
  authorizationHeader: string | undefined,
  testUserId?: string
): Promise<AuthenticatedUser | null> {
  if (process.env.NODE_ENV === "test") {
    return {
      id: testUserId && testUserId.trim().length > 0 ? testUserId : "test-user",
      email: "test@example.com",
      name: "Test User"
    };
  }

  const token = parseBearerToken(authorizationHeader);

  if (!token) {
    return null;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: configuredClientIds
    });
    const payload = ticket.getPayload();

    if (!payload?.sub || !payload.email) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email
    };
  } catch {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
        {
          method: "GET"
        }
      );

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as GoogleTokenInfoResponse;
      const audienceMatches =
        typeof payload.aud === "string" && configuredClientIds.includes(payload.aud);

      if (
        !audienceMatches ||
        payload.email_verified !== "true" ||
        !payload.sub ||
        !payload.email
      ) {
        return null;
      }

      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email
      };
    } catch {
      return null;
    }
  }
}
