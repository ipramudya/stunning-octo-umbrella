import { z } from "zod";

export const evidenceUploadSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png"]),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024),
});

export type EvidenceUploadDto = z.infer<typeof evidenceUploadSchema>;
