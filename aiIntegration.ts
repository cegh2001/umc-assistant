import {
  GoogleGenAI,
  ThinkingLevel,
  type Chat,
  type GenerateContentResponse,
} from "@google/genai";
import "dotenv/config";

export interface ChatSession {
  chat: Chat;
}

export interface SourceReference {
  title: string;
  url: string;
}

export interface ChatResponse {
  text: string;
  sources: SourceReference[];
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
Eres un asistente virtual especializado en la Universidad Nacional Experimental Maritima del Caribe (UMC) llamado Nautilus.

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
  const chat = ai.chats.create({
    model,
    history: [
      {
        role: "user",
        parts: [
          {
            text: `${ASSISTANT_BOOTSTRAP}\n\nBASE LOCAL UMC:\n\n${knowledgeBase}`,
          },
        ],
      },
      {
        role: "model",
        parts: [{ text: "ACK" }],
      },
    ],
  });

  return {
    chat,
  };
}

export async function sendChatMessage(
  session: ChatSession,
  userInput: string
): Promise<ChatResponse> {
  const response = await createResponse(session.chat, userInput);
  return extractResponse(response);
}

async function createResponse(
  chat: Chat,
  userInput: string
) : Promise<GenerateContentResponse> {
  const baseConfig = {
    tools: [{ googleSearch: {} }],
  };

  if (!shouldRequestThinking(model)) {
    return chat.sendMessage({
      message: userInput,
      config: baseConfig,
    });
  }

  try {
    return await chat.sendMessage({
      message: userInput,
      config: {
        ...baseConfig,
        thinkingConfig: {
          thinkingLevel: selectThinkingLevel(userInput),
        },
      },
    });
  } catch (error) {
    if (isThinkingUnsupportedError(error)) {
      return chat.sendMessage({
        message: userInput,
        config: baseConfig,
      });
    }

    throw error;
  }
}

function selectThinkingLevel(userInput: string): ThinkingLevel.HIGH | ThinkingLevel.LOW {
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
    ? ThinkingLevel.HIGH
    : ThinkingLevel.LOW;
}

function shouldRequestThinking(modelName: string): boolean {
  return modelName.startsWith("gemma-4-") || modelName.startsWith("gemini-");
}

function isThinkingUnsupportedError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes("thinking budget is not supported") ||
    message.includes("thinking level is not supported");
}

function extractErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }

  const nestedError = (error as {
    error?: { error?: { message?: unknown }; message?: unknown };
  }).error;

  if (nestedError?.error?.message && typeof nestedError.error.message === "string") {
    return nestedError.error.message;
  }

  if (nestedError?.message && typeof nestedError.message === "string") {
    return nestedError.message;
  }

  return "";
}

function extractResponse(response: GenerateContentResponse): ChatResponse {
  const text = response.text?.trim();

  if (text) {
    return {
      text,
      sources: extractSources(response),
    };
  }

  throw new Error("El modelo no devolvio texto util para mostrar.");
}

function extractSources(response: GenerateContentResponse): SourceReference[] {
  const sources = new Map<string, SourceReference>();

  for (const candidate of response.candidates ?? []) {
    collectCandidateCitations(candidate, sources);
    collectGroundingMetadataSources(candidate, sources);
  }

  return Array.from(sources.values()).slice(0, 6);
}

function collectCandidateCitations(
  candidate: unknown,
  sources: Map<string, SourceReference>
): void {
  if (!candidate || typeof candidate !== "object") {
    return;
  }

  const citationMetadata = (candidate as {
    citationMetadata?: { citations?: unknown[] };
  }).citationMetadata;

  if (!citationMetadata || !Array.isArray(citationMetadata.citations)) {
    return;
  }

  for (const citation of citationMetadata.citations) {
    if (!citation || typeof citation !== "object") {
      continue;
    }

    const url = (citation as { uri?: unknown }).uri;
    if (typeof url !== "string" || !url) {
      continue;
    }

    const title = (citation as { title?: unknown }).title;
    addSource(sources, typeof title === "string" ? title : url, url);
  }
}

function collectGroundingMetadataSources(
  value: unknown,
  sources: Map<string, SourceReference>
): void {
  if (!value || typeof value !== "object") {
    return;
  }

  const groundingMetadata = (value as {
    groundingMetadata?: { groundingChunks?: unknown[] };
  }).groundingMetadata;

  if (!groundingMetadata || !Array.isArray(groundingMetadata.groundingChunks)) {
    return;
  }

  for (const chunk of groundingMetadata.groundingChunks) {
    if (!chunk || typeof chunk !== "object") {
      continue;
    }

    const web = (chunk as { web?: { title?: unknown; uri?: unknown } }).web;
    if (!web || typeof web.uri !== "string" || !web.uri) {
      continue;
    }

    addSource(
      sources,
      typeof web.title === "string" && web.title ? web.title : web.uri,
      web.uri
    );
  }
}

function addSource(
  sources: Map<string, SourceReference>,
  title: string,
  url: string
): void {
  if (!sources.has(url)) {
    sources.set(url, { title, url });
  }
}