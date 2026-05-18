import { GoogleGenAI } from "@google/genai";
import "dotenv/config";

export interface ChatSession {
  lastInteractionId: string;
}

const apiKey = process.env.GEMINI_API_KEY ?? process.env.API_KEY;

if (!apiKey) {
  throw new Error(
    "Falta GEMINI_API_KEY en el entorno. Usa .env.example como referencia."
  );
}

const model = process.env.GEMINI_MODEL ?? "gemma-4-26b-a4b-it";
const ai = new GoogleGenAI({ apiKey });

const ASSISTANT_BOOTSTRAP = `
Eres un asistente virtual especializado en la Universidad Nacional Experimental Maritima del Caribe (UMC).

Reglas de trabajo:
- Usa la base de conocimiento local como fuente principal.
- Si la respuesta no esta en la base o parece desactualizada, usa Google Search para verificarla.
- Prioriza siempre paginas oficiales de la UMC o el dominio umc.edu.ve cuando exista una fuente oficial.
- Si un enlace en la base tiene un ano viejo como 2022 o 2023, tomalo solo como pista historica y verifica la URL actual antes de responder.
- No inventes informacion. Si no puedes verificar un dato actual, dilo con claridad.
- Cuando des una respuesta con informacion web actualizada, intenta devolver el enlace vigente y util.
- Mantente enfocado en preguntas de la UMC y temas universitarios relacionados.

Vas a recibir la base local una sola vez al inicio para usarla como contexto persistente.
Cuando termines de procesarla responde solo con ACK.
`.trim();

export async function bootstrapChatSession(
  knowledgeBase: string
): Promise<ChatSession> {
  const interaction = await ai.interactions.create({
    model,
    input: `${ASSISTANT_BOOTSTRAP}\n\nBASE LOCAL UMC:\n\n${knowledgeBase}`,
  });

  return {
    lastInteractionId: interaction.id,
  };
}

export async function sendChatMessage(
  session: ChatSession,
  userInput: string
): Promise<string> {
  const interaction = await ai.interactions.create({
    model,
    input: userInput,
    previous_interaction_id: session.lastInteractionId,
    tools: [{ type: "google_search" }],
    generation_config: {
      thinking_level: selectThinkingLevel(userInput),
    },
  });

  session.lastInteractionId = interaction.id;
  return extractInteractionText(interaction);
}

function selectThinkingLevel(userInput: string): "low" | "high" {
  const normalizedInput = userInput.toLowerCase();
  const highThinkingPatterns = [
    "actual",
    "actualizado",
    "actualizada",
    "hoy",
    "vigente",
    "2026",
    "link",
    "enlace",
    "url",
    "pagina",
    "página",
    "verifica",
    "verificar",
    "buscar",
    "busca",
    "consulta",
    "calendario",
    "inscripcion",
    "inscripción",
    "admision",
    "admisión",
    "pasantia",
    "pasantía"
  ];

  return highThinkingPatterns.some((pattern) => normalizedInput.includes(pattern))
    ? "high"
    : "low";
}

function extractInteractionText(interaction: unknown): string {
  if (!interaction || typeof interaction !== "object") {
    throw new Error("La respuesta del modelo llego en un formato inesperado.");
  }

  const outputs = "outputs" in interaction ? (interaction as { outputs?: unknown }).outputs : undefined;

  if (Array.isArray(outputs)) {
    const textBlocks = outputs
      .filter(
        (output): output is { type: string; text: string } =>
          typeof output === "object" &&
          output !== null &&
          "type" in output &&
          "text" in output &&
          (output as { type?: unknown }).type === "text" &&
          typeof (output as { text?: unknown }).text === "string"
      )
      .map((output) => output.text.trim())
      .filter(Boolean);

    if (textBlocks.length > 0) {
      return textBlocks.join("\n\n");
    }
  }

  throw new Error("El modelo no devolvio texto util para mostrar.");
}