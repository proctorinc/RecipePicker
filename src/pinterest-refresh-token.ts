import process from "node:process";

import { getEnvFilePath, upsertEnvValue } from "./env-file.js";
import { getApiBaseUrl, requireEnv } from "./pinterest-api.js";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
};

function buildBasicAuthHeader(clientId: string, clientSecret: string): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

async function main() {
  const clientId = requireEnv("PINTEREST_APP_ID");
  const clientSecret = requireEnv("PINTEREST_APP_SECRET");
  const refreshToken = requireEnv("PINTEREST_REFRESH_TOKEN");

  const params = new URLSearchParams();
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);

  const response = await fetch(`${getApiBaseUrl().replace(/\/$/, "")}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Pinterest token refresh failed (${response.status} ${response.statusText}): ${raw}`);
  }

  const token = JSON.parse(raw) as TokenResponse;
  const envPath = getEnvFilePath();
  upsertEnvValue(envPath, "PINTEREST_ACCESS_TOKEN", token.access_token);

  if (token.refresh_token) {
    upsertEnvValue(envPath, "PINTEREST_REFRESH_TOKEN", token.refresh_token);
  }

  console.log("Refreshed Pinterest token and saved it to .env");
  console.log(JSON.stringify(token, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
