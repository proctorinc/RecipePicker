import fs from "node:fs";
import http from "node:http";
import process from "node:process";
import crypto from "node:crypto";

import { logInfo, runScriptWithLogging } from "@/lib/server/logger";
import { getEnvFilePath, upsertEnvValue } from "./env-file.js";
import { getApiBaseUrl, requireEnv } from "./pinterest-api.js";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

function parseRedirectUri(redirectUri: string): URL {
  const url = new URL(redirectUri);

  if (url.protocol !== "http:" || (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) {
    throw new Error("PINTEREST_REDIRECT_URI must use http://localhost or http://127.0.0.1 for this local OAuth helper.");
  }

  return url;
}

function getScopes(): string {
  return process.env.PINTEREST_OAUTH_SCOPES?.trim() || "boards:read,pins:read";
}

function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://www.pinterest.com/oauth/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", getScopes());
  url.searchParams.set("state", state);
  return url.toString();
}

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<TokenResponse> {
  const tokenUrl = `${getApiBaseUrl().replace(/\/$/, "")}/oauth/token`;
  const params = new URLSearchParams();
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", redirectUri);

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Pinterest token exchange failed (${response.status} ${response.statusText}): ${raw}`);
  }

  return JSON.parse(raw) as TokenResponse;
}

function saveTokens(token: TokenResponse) {
  const envPath = getEnvFilePath();
  upsertEnvValue(envPath, "PINTEREST_ACCESS_TOKEN", token.access_token);

  if (token.refresh_token) {
    upsertEnvValue(envPath, "PINTEREST_REFRESH_TOKEN", token.refresh_token);
  }
}

function callbackHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pinterest OAuth Complete</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        padding: 2rem;
        background: #faf7f2;
        color: #2b2118;
      }
      main {
        max-width: 42rem;
        margin: 4rem auto;
        background: white;
        border-radius: 16px;
        padding: 2rem;
        box-shadow: 0 12px 40px rgba(43, 33, 24, 0.08);
      }
      code {
        background: #f3eee6;
        padding: 0.15rem 0.35rem;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Pinterest OAuth complete</h1>
      <p>${message}</p>
      <p>You can close this tab and return to the terminal.</p>
    </main>
  </body>
</html>`;
}

async function waitForAuthorizationCode(redirectUri: string, expectedState: string): Promise<string> {
  const redirectUrl = parseRedirectUri(redirectUri);
  const port = Number(redirectUrl.port || "80");

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Missing request URL.");
        return;
      }

      const requestUrl = new URL(req.url, `${redirectUrl.protocol}//${redirectUrl.host}`);

      if (requestUrl.pathname !== redirectUrl.pathname) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found.");
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const errorDescription = requestUrl.searchParams.get("error_description");
      const state = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHtml(`Pinterest returned an error: <code>${error}</code> ${errorDescription ?? ""}`));
        server.close();
        reject(new Error(`Pinterest returned an error: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHtml("State mismatch. This OAuth response did not match the original request."));
        server.close();
        reject(new Error("State mismatch in OAuth callback."));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHtml("Missing authorization code in callback."));
        server.close();
        reject(new Error("Missing authorization code in OAuth callback."));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(callbackHtml("Authorization code received. Exchanging it for a token now."));
      server.close();
      resolve(code);
    });

    server.on("error", (error) => {
      reject(error);
    });

    server.listen(port, redirectUrl.hostname, () => {
      logInfo("script.pinterest_oauth.callback_listener_ready", {
        result: {
          redirectUri,
        },
      });
      process.stdout.write(`Listening for Pinterest OAuth callback on ${redirectUri}\n`);
    });
  });
}

async function main() {
  const clientId = requireEnv("PINTEREST_APP_ID");
  const clientSecret = requireEnv("PINTEREST_APP_SECRET");
  const redirectUri = requireEnv("PINTEREST_REDIRECT_URI");
  parseRedirectUri(redirectUri);

  const state = crypto.randomUUID();
  const authorizeUrl = buildAuthorizeUrl(clientId, redirectUri, state);

  process.stdout.write("1. Make sure this exact redirect URI is registered in your Pinterest app:\n");
  process.stdout.write(`   ${redirectUri}\n\n`);
  process.stdout.write("2. Open this URL in your browser and approve access:\n");
  process.stdout.write(`${authorizeUrl}\n\n`);

  const code = await waitForAuthorizationCode(redirectUri, state);
  const token = await exchangeCodeForToken(clientId, clientSecret, redirectUri, code);
  saveTokens(token);

  logInfo("script.pinterest_oauth.succeeded", {
    result: {
      hasRefreshToken: Boolean(token.refresh_token),
      scopeCount: token.scope?.split(",").filter(Boolean).length ?? 0,
    },
  });
  process.stdout.write("Pinterest OAuth succeeded.\n");
  process.stdout.write("Saved PINTEREST_ACCESS_TOKEN to the env file.\n");

  if (token.refresh_token) {
    process.stdout.write("Saved PINTEREST_REFRESH_TOKEN to the env file.\n");
  } else {
    process.stdout.write("Pinterest did not return a refresh token in this response.\n");
  }
}

runScriptWithLogging({
  scriptName: "script.pinterest_oauth",
  fn: main,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
