import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTENT_HEADING = "## Contenido";
const MIGRATIONS_HEADING = "## Migraciones detectadas";

export async function loadKnowledgeBase(): Promise<string> {
  const knowledgeBasePath = resolve(
    process.cwd(),
    process.env.KNOWLEDGE_BASE_PATH ?? "preguntas-base-conocimiento.md"
  );
  const markdown = await readFile(knowledgeBasePath, "utf8");
  return extractRelevantSection(markdown);
}

function extractRelevantSection(markdown: string): string {
  const startIndex = markdown.indexOf(CONTENT_HEADING);
  const endIndex = markdown.indexOf(MIGRATIONS_HEADING);

  if (startIndex === -1) {
    return markdown.trim();
  }

  const contentStart = startIndex + CONTENT_HEADING.length;
  const contentEnd = endIndex === -1 ? markdown.length : endIndex;
  return markdown.slice(contentStart, contentEnd).trim();
}