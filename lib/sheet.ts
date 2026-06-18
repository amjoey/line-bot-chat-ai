export interface FaqRow {
  question: string;
  answer: string;
  category?: string;
}

interface Cache {
  data: FaqRow[];
  expiresAt: number;
}

const TTL_MS = 60_000;

let cache: Cache | null = null;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(csv: string): FaqRow[] {
  const lines = csv.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const questionIdx = header.indexOf("question");
  const answerIdx = header.indexOf("answer");
  const categoryIdx = header.indexOf("category");

  if (questionIdx === -1 || answerIdx === -1) return [];

  const rows: FaqRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const question = cells[questionIdx]?.trim();
    const answer = cells[answerIdx]?.trim();
    if (!question || !answer) continue;

    rows.push({
      question,
      answer,
      category: categoryIdx !== -1 ? cells[categoryIdx]?.trim() : undefined,
    });
  }
  return rows;
}

export async function getFaq(): Promise<FaqRow[]> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.data;
  }

  try {
    const res = await fetch(process.env.SHEET_CSV_URL!, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Sheet fetch failed with status ${res.status}`);
    }
    const csv = await res.text();
    const data = parseCsv(csv);
    cache = { data, expiresAt: Date.now() + TTL_MS };
    return data;
  } catch (err) {
    console.error("[SHEET_ERROR]", err);
    if (cache) {
      return cache.data;
    }
    return [];
  }
}

export function faqToText(rows: FaqRow[]): string {
  return rows
    .map((row) => `Q: ${row.question}\nA: ${row.answer}`)
    .join("\n\n");
}
