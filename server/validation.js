import { z } from "zod";

export const MIN_CUE_NUMBER = 1;

export const cueNumberParam = z.coerce
  .number()
  .int()
  .min(MIN_CUE_NUMBER, `Cue number must be at least ${MIN_CUE_NUMBER}`);

export const tallyEntrySchema = z.object({
  cueNumber: z.number().int().min(MIN_CUE_NUMBER),
  tally: z.enum(["live", "selected", "played", "off"]),
});

export const tallyArraySchema = z.array(tallyEntrySchema);

export const ackBodySchema = z.object({
  seq: z.number().int(),
});
