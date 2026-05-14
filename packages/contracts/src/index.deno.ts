// Deno-compatible entry point for the ingest Edge Function.
// Uses .ts specifiers throughout so the Supabase CLI esbuild bundler can
// resolve modules. The Node-side index.ts uses .js specifiers per Node ESM
// convention; those cannot be used with esbuild's file resolver.
// scraper.ts is omitted — it is only needed by the Node scraper process.
export type { OrderSnapshot, OrderStatus } from "./orderSnapshot.ts";
export { OrderSnapshotSchema } from "./orderSnapshot.ts";
export type {
  IngestOrdersPayload,
  IngestFailurePayload,
  IngestPayload,
} from "./ingest.deno.ts";
export {
  IngestOrdersPayloadSchema,
  IngestFailurePayloadSchema,
  IngestPayloadSchema,
} from "./ingest.deno.ts";
