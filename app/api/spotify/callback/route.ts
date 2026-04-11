import { NextRequest, NextResponse } from "next/server";

// Exchanges the authorization code from Spotify's OAuth redirect for an
// access token + refresh token using the PKCE flow.
// The client_id is supplied by the caller — it's a public value in PKCE and
// does not need to be kept server-side.
export async function POST(req: NextRequest) {
  const { code, codeVerifier, redirectUri, clientId } = await req.json();

  if (!code || !codeVerifier || !redirectUri || !clientId) {
    return NextResponse.json(
      { error: "code, codeVerifier, redirectUri and clientId are required" },
      { status: 400 }
    );
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error_description || data.error || "Token exchange failed" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to contact Spotify" }, { status: 500 });
  }
}

// Exchanges a refresh token for a new access token.
export async function PUT(req: NextRequest) {
  const { refreshToken, clientId } = await req.json();

  if (!refreshToken || !clientId) {
    return NextResponse.json({ error: "refreshToken and clientId are required" }, { status: 400 });
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error_description || data.error || "Token refresh failed" },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to contact Spotify" }, { status: 500 });
  }
}
