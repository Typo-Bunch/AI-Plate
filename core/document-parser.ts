/**
 * Universal Document Parser.
 *
 * Extracts clean, human-readable text from uploaded files (PDFs, Markdown,
 * Source Code, CSV, JSON, Plaintext) before vector embedding and sandbox persistence.
 */

import { extname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export interface ParsedDocument {
  filename: string;
  text: string;
  isBinary: boolean;
  extractedLength: number;
}

/**
 * Extract clean plaintext from a file buffer or string.
 */
export async function parseDocumentContent(
  filename: string,
  bufferOrString: Buffer | string
): Promise<ParsedDocument> {
  const ext = extname(filename).toLowerCase();
  const buffer = Buffer.isBuffer(bufferOrString)
    ? bufferOrString
    : Buffer.from(bufferOrString, "utf-8");

  // 1. PDF Parser
  if (ext === ".pdf") {
    try {
      let rawText = "";
      if (typeof pdfParse === "function") {
        const data = await pdfParse(buffer);
        rawText = data?.text || "";
      } else if (pdfParse && typeof pdfParse.PDFParse === "function") {
        const parser = new pdfParse.PDFParse({ data: buffer });
        const result = await parser.getText();
        rawText = typeof result === "string" ? result : result?.text || "";
        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }
      } else if (pdfParse && typeof (pdfParse as any).default === "function") {
        const data = await (pdfParse as any).default(buffer);
        rawText = data?.text || "";
      }

      const cleanedText = (rawText || "")
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (cleanedText.length > 0) {
        return {
          filename,
          text: cleanedText,
          isBinary: true,
          extractedLength: cleanedText.length,
        };
      }
    } catch (err: any) {
      console.warn(`[WARN] PDF parsing fallback for ${filename}:`, err.message);
    }
  }

  // 2. Large CSV / TSV Structured Extraction
  if (ext === ".csv" || ext === ".tsv") {
    const rawText = buffer.toString("utf-8");
    const delimiter = ext === ".tsv" ? "\t" : ",";
    const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);

    // If small (< 300 lines), index as-is
    if (lines.length <= 300) {
      return {
        filename,
        text: rawText,
        isBinary: false,
        extractedLength: rawText.length,
      };
    }

    // For large datasets, generate a high-density schema & sample summary for RAG
    // Full raw file remains in .sandbox/ and artifacts/ for Python pandas execution
    const header = lines[0];
    const columns = header.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const totalRows = lines.length - 1;

    const sampleHead = lines.slice(1, Math.min(150, lines.length)).join("\n");
    const sampleTail = lines.slice(Math.max(1, lines.length - 30)).join("\n");

    const structuredSummary = [
      `# Structured Dataset: ${filename}`,
      `Total Rows: ${totalRows.toLocaleString()} rows | Columns: ${columns.length} columns`,
      `Column Names: ${columns.join(" | ")}`,
      `\n## Schema & First 150 Rows Preview:`,
      sampleHead,
      `\n## Last 30 Rows Preview:`,
      sampleTail,
      `\n[Note: Full dataset with ${totalRows.toLocaleString()} rows is available in the workspace. For complex analytics, filtering, calculations, and plotting, execute Python scripts with pandas.]`,
    ].join("\n");

    return {
      filename,
      text: structuredSummary,
      isBinary: false,
      extractedLength: structuredSummary.length,
    };
  }

  // 3. Standard Text / Code files
  const textContent = buffer.toString("utf-8");
  return {
    filename,
    text: textContent,
    isBinary: false,
    extractedLength: textContent.length,
  };
}
