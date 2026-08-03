/**
 * The shape the model must return.
 *
 * Two layers of enforcement, and they are not redundant:
 *
 *   1. The API's structured-output mode is given this schema, so the provider
 *      constrains generation server-side. Malformed JSON becomes very unlikely
 *      rather than merely handled.
 *   2. This zod schema re-validates whatever comes back anyway. The model's
 *      output is untrusted input regardless of what the provider promises, and
 *      a schema-invalid response is a normal, logged outcome rather than an
 *      incident.
 *
 * Note what the schema does NOT do: it cannot keep the price inside the band.
 * A number can satisfy every type constraint here and still breach an owner's
 * limit. That is the clamp's job, downstream, and it is why the bounding logic
 * exists at all.
 */

import { z } from "zod";

/** JSON Schema handed to the API for server-side structured output. */
export const OFFER_SELECTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    unitPriceMicroUsdc: {
      type: "string",
      description:
        "Chosen unit price in micro-USDC, as a decimal integer string. " +
        "Must be within the permitted range given in the prompt.",
    },
    rationale: {
      type: "string",
      description:
        "One sentence, under 200 characters, explaining the offer in plain " +
        "language to a human audience.",
    },
  },
  required: ["unitPriceMicroUsdc", "rationale"],
  additionalProperties: false,
} as const;

export const offerSelectionResponseSchema = z
  .object({
    unitPriceMicroUsdc: z
      .string()
      .regex(/^\d+$/, "unitPriceMicroUsdc must be a non-negative integer string"),
    rationale: z.string(),
  })
  .strict();

export type OfferSelectionResponse = z.infer<typeof offerSelectionResponseSchema>;

/** Parse raw model text. Tolerates fenced code blocks; rejects everything else. */
export function parseOfferSelectionResponse(raw: string): OfferSelectionResponse {
  const unfenced = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return offerSelectionResponseSchema.parse(JSON.parse(unfenced));
}
