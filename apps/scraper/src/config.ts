import { readFileSync } from "node:fs";
import { z } from "zod";

const DistroCredsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const ConfigSchema = z.object({
  ingestUrl: z.string().url(),
  scraperToken: z.string().min(1),
  distros: z.record(z.string(), DistroCredsSchema),
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(input: unknown): Config {
  return ConfigSchema.parse(input);
}

export function loadConfig(path = "config.local.json"): Config {
  const raw = readFileSync(path, "utf8");
  return parseConfig(JSON.parse(raw));
}
