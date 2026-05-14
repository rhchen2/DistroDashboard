import { z } from "zod";
import { OrderSnapshotSchema } from "./orderSnapshot.js";

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
