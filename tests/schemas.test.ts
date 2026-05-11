import { describe, it, expect } from 'vitest';
import {
  DirectorChangeSchema,
  DirectorExtractionSchema,
  ExtractionSummarySchema,
  PipelineOutputSchema,
} from '../src/schemas/director-schema.js';

const validDirectorChange = {
  company_name: "Reliance Industries Limited",
  stock_ticker: "RELIANCE",
  director_name: "Mukesh Ambani",
  change_type: "appointment" as const,
  effective_date: "2026-01-15",
  reason_stated: "Appointed as additional director",
  extraction_confidence: "high" as const,
};

describe('DirectorChangeSchema', () => {
  describe('null coercion', () => {
    it('coerces empty string to null for stock_ticker', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, stock_ticker: "" });
      expect(result.stock_ticker).toBeNull();
    });

    it('coerces empty string to null for effective_date', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, effective_date: "" });
      expect(result.effective_date).toBeNull();
    });

    it('coerces empty string to null for reason_stated', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, reason_stated: "" });
      expect(result.reason_stated).toBeNull();
    });

    it('coerces "N/A" to null for stock_ticker', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, stock_ticker: "N/A" });
      expect(result.stock_ticker).toBeNull();
    });

    it('coerces "N/A" to null for effective_date', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, effective_date: "N/A" });
      expect(result.effective_date).toBeNull();
    });

    it('coerces "N/A" to null for reason_stated', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, reason_stated: "N/A" });
      expect(result.reason_stated).toBeNull();
    });

    it('coerces "n/a" (lowercase) to null', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, stock_ticker: "n/a" });
      expect(result.stock_ticker).toBeNull();
    });

    it('preserves explicit null values', () => {
      const result = DirectorChangeSchema.parse({
        ...validDirectorChange,
        stock_ticker: null,
        effective_date: null,
        reason_stated: null,
      });
      expect(result.stock_ticker).toBeNull();
      expect(result.effective_date).toBeNull();
      expect(result.reason_stated).toBeNull();
    });

    it('preserves valid non-empty strings', () => {
      const result = DirectorChangeSchema.parse(validDirectorChange);
      expect(result.stock_ticker).toBe("RELIANCE");
      expect(result.reason_stated).toBe("Appointed as additional director");
    });
  });

  describe('enum enforcement', () => {
    it('accepts valid change_type values', () => {
      for (const ct of ["appointment", "resignation", "removal"] as const) {
        const result = DirectorChangeSchema.parse({ ...validDirectorChange, change_type: ct });
        expect(result.change_type).toBe(ct);
      }
    });

    it('rejects invalid change_type', () => {
      expect(() =>
        DirectorChangeSchema.parse({ ...validDirectorChange, change_type: "promotion" })
      ).toThrow();
    });

    it('accepts valid extraction_confidence values', () => {
      for (const ec of ["high", "medium", "low"] as const) {
        const result = DirectorChangeSchema.parse({ ...validDirectorChange, extraction_confidence: ec });
        expect(result.extraction_confidence).toBe(ec);
      }
    });

    it('rejects invalid extraction_confidence', () => {
      expect(() =>
        DirectorChangeSchema.parse({ ...validDirectorChange, extraction_confidence: "unknown" })
      ).toThrow();
    });
  });

  describe('date format validation', () => {
    it('accepts valid YYYY-MM-DD dates', () => {
      const result = DirectorChangeSchema.parse({ ...validDirectorChange, effective_date: "2026-05-11" });
      expect(result.effective_date).toBe("2026-05-11");
    });

    it('rejects "May 2026" format', () => {
      expect(() =>
        DirectorChangeSchema.parse({ ...validDirectorChange, effective_date: "May 2026" })
      ).toThrow();
    });

    it('rejects "2026/05/11" format', () => {
      expect(() =>
        DirectorChangeSchema.parse({ ...validDirectorChange, effective_date: "2026/05/11" })
      ).toThrow();
    });

    it('rejects "11-05-2026" (DD-MM-YYYY) format', () => {
      expect(() =>
        DirectorChangeSchema.parse({ ...validDirectorChange, effective_date: "11-05-2026" })
      ).toThrow();
    });
  });

  describe('required fields', () => {
    it('validates a complete valid object', () => {
      const result = DirectorChangeSchema.parse(validDirectorChange);
      expect(result.company_name).toBe("Reliance Industries Limited");
      expect(result.director_name).toBe("Mukesh Ambani");
      expect(result.change_type).toBe("appointment");
    });

    it('rejects missing company_name', () => {
      const { company_name, ...rest } = validDirectorChange;
      expect(() => DirectorChangeSchema.parse(rest)).toThrow();
    });

    it('rejects missing director_name', () => {
      const { director_name, ...rest } = validDirectorChange;
      expect(() => DirectorChangeSchema.parse(rest)).toThrow();
    });

    it('rejects missing change_type', () => {
      const { change_type, ...rest } = validDirectorChange;
      expect(() => DirectorChangeSchema.parse(rest)).toThrow();
    });

    it('rejects missing extraction_confidence', () => {
      const { extraction_confidence, ...rest } = validDirectorChange;
      expect(() => DirectorChangeSchema.parse(rest)).toThrow();
    });
  });
});

describe('DirectorExtractionSchema', () => {
  it('validates with source_filename added', () => {
    const result = DirectorExtractionSchema.parse({
      source_filename: "filing-001.pdf",
      ...validDirectorChange,
    });
    expect(result.source_filename).toBe("filing-001.pdf");
    expect(result.company_name).toBe("Reliance Industries Limited");
  });

  it('rejects missing source_filename', () => {
    expect(() => DirectorExtractionSchema.parse(validDirectorChange)).toThrow();
  });

  it('applies null coercion on nested fields', () => {
    const result = DirectorExtractionSchema.parse({
      source_filename: "filing-002.pdf",
      ...validDirectorChange,
      stock_ticker: "N/A",
      effective_date: "",
    });
    expect(result.stock_ticker).toBeNull();
    expect(result.effective_date).toBeNull();
  });
});

describe('ExtractionSummarySchema', () => {
  const validSummary = {
    total_documents_processed: 49,
    director_change_documents_identified: 12,
    total_director_changes_extracted: 18,
    documents_that_failed_processing: ["corrupted.pdf", "unreadable.pdf"],
  };

  it('validates a correct summary', () => {
    const result = ExtractionSummarySchema.parse(validSummary);
    expect(result.total_documents_processed).toBe(49);
    expect(result.documents_that_failed_processing).toHaveLength(2);
  });

  it('accepts empty DLQ array', () => {
    const result = ExtractionSummarySchema.parse({
      ...validSummary,
      documents_that_failed_processing: [],
    });
    expect(result.documents_that_failed_processing).toHaveLength(0);
  });

  it('rejects negative numbers', () => {
    expect(() =>
      ExtractionSummarySchema.parse({ ...validSummary, total_documents_processed: -1 })
    ).toThrow();
  });

  it('rejects non-integer numbers', () => {
    expect(() =>
      ExtractionSummarySchema.parse({ ...validSummary, total_documents_processed: 3.5 })
    ).toThrow();
  });
});

describe('PipelineOutputSchema', () => {
  it('validates complete pipeline output', () => {
    const output = {
      extractions: [
        {
          source_filename: "filing-001.pdf",
          ...validDirectorChange,
        },
      ],
      summary: {
        total_documents_processed: 1,
        director_change_documents_identified: 1,
        total_director_changes_extracted: 1,
        documents_that_failed_processing: [],
      },
    };
    const result = PipelineOutputSchema.parse(output);
    expect(result.extractions).toHaveLength(1);
    expect(result.summary.total_documents_processed).toBe(1);
  });

  it('validates with empty extractions array', () => {
    const output = {
      extractions: [],
      summary: {
        total_documents_processed: 5,
        director_change_documents_identified: 0,
        total_director_changes_extracted: 0,
        documents_that_failed_processing: ["bad1.pdf", "bad2.pdf"],
      },
    };
    const result = PipelineOutputSchema.parse(output);
    expect(result.extractions).toHaveLength(0);
    expect(result.summary.documents_that_failed_processing).toHaveLength(2);
  });

  it('rejects missing summary', () => {
    expect(() => PipelineOutputSchema.parse({ extractions: [] })).toThrow();
  });

  it('rejects missing extractions', () => {
    expect(() =>
      PipelineOutputSchema.parse({
        summary: {
          total_documents_processed: 0,
          director_change_documents_identified: 0,
          total_director_changes_extracted: 0,
          documents_that_failed_processing: [],
        },
      })
    ).toThrow();
  });
});
