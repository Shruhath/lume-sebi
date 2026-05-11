import { z } from 'zod';

const coercibleNullableString = () => z.preprocess(
  (val) => (val === "" || val === "N/A" || val === "n/a") ? null : val,
  z.string().nullable()
);

const coercibleNullableDate = () => z.preprocess(
  (val) => (val === "" || val === "N/A" || val === "n/a") ? null : val,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format").nullable()
);

export const DirectorChangeSchema = z.object({
  company_name: z.string().describe("The full legal name of the company as stated in the regulatory filing"),
  stock_ticker: coercibleNullableString().describe("The BSE or NSE stock ticker symbol, or null if not mentioned"),
  director_name: z.string().describe("The full name of the board director involved in the change"),
  change_type: z.enum(["appointment", "resignation", "removal"]).describe("The type of board director change event"),
  effective_date: coercibleNullableDate().describe("The effective date of the change in YYYY-MM-DD format, or null if not specified"),
  reason_stated: coercibleNullableString().describe("The reason for the change as stated in the filing, or null if no reason given"),
  extraction_confidence: z.enum(["high", "medium", "low"]).describe("Confidence level based on clarity and ambiguity of the source text"),
});

export type DirectorChange = z.infer<typeof DirectorChangeSchema>;

export const DirectorExtractionSchema = z.object({
  source_filename: z.string(),
  ...DirectorChangeSchema.shape,
});

export type DirectorExtraction = z.infer<typeof DirectorExtractionSchema>;

export const ExtractionSummarySchema = z.object({
  total_documents_processed: z.number().int().nonnegative(),
  director_change_documents_identified: z.number().int().nonnegative(),
  total_director_changes_extracted: z.number().int().nonnegative(),
  documents_that_failed_processing: z.array(z.string()),
});

export type ExtractionSummary = z.infer<typeof ExtractionSummarySchema>;

export const PipelineOutputSchema = z.object({
  extractions: z.array(DirectorExtractionSchema),
  summary: ExtractionSummarySchema,
});

export type PipelineOutput = z.infer<typeof PipelineOutputSchema>;
