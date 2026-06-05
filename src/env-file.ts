import fs from "node:fs";
import path from "node:path";

export function getEnvFilePath(): string {
  return path.resolve(".env");
}

export function upsertEnvValue(envPath: string, key: string, value: string) {
  const nextLine = `${key}=${value}`;
  let contents = "";

  if (fs.existsSync(envPath)) {
    contents = fs.readFileSync(envPath, "utf8");
  }

  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(contents)) {
    contents = contents.replace(pattern, nextLine);
  } else if (contents.trim().length === 0) {
    contents = `${nextLine}\n`;
  } else {
    if (!contents.endsWith("\n")) {
      contents += "\n";
    }
    contents += `${nextLine}\n`;
  }

  fs.writeFileSync(envPath, contents, "utf8");
}
