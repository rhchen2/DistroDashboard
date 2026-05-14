// Deno-compatible mirror of ingest.ts.
// Identical logic but imports orderSnapshot with a .ts specifier, which the
// Supabase CLI esbuild bundler requires (it does not resolve .js → .ts).
// Keep in sync with ingest.ts if schemas change.
import { z } from "zod";
import { OrderSnapshotSchema } from "./orderSnapshot.ts";

export const IngestOrdersPayloadSchema = z.object({
  kind: z.literal("orders"),
  distroSlug: z.string().min(1),
  syncRunId: z.string().uuid(),
  rows: z.array(OrderSnapshotSchema),
});
export type IngestOrdersPayload = z.infer<typeof IngestOrdersPayloadSchema>;

export const IngestFailurePayloadSchema = z.object({
  kind: z.literal("failure"),
  distroSlug: z.string().min(1),
  syncRunId: z.string().uuid(),
  error: z.string(),
  screenshotBase64: z.string().nullable(),
});
export type IngestFailurePayload = z.infer<typeof IngestFailurePayloadSchema>;

export const IngestPayloadSchema = z.discriminatedUnion("kind", [
  IngestOrdersPayloadSchema,
  IngestFailurePayloadSchema,
]);
export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
