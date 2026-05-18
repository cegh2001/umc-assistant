import {
  GoogleGenAI,
  ThinkingLevel,
  createPartFromBase64,
  createPartFromText,
  type Chat,
  type GenerateContentResponse,
  type Part,
  type PartListUnion,
} from "@google/genai";
import "dotenv/config";

export interface ChatSession {
  chat: Chat;
}

export interface SourceReference {
  title: string;
  url: string;
  resolvedUrl: string;
  status: "activa" | "caida" | "no_verificada";
  httpStatus?: number;
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
const CAMPUS_MAP_DRIVE_URL =
  "https://drive.google.com/file/d/1ODEyaBfEuYq5mRltqYV0kISUHYenuE-x/view?usp=drive_link";

let cachedCampusMapPartPromise: Promise<Part | null> | undefined;

const ASSISTANT_BOOTSTRAP = `
Eres un asistente virtual especializado en la Universidad Nacional Experimental Maritima del Caribe (UMC) llamado Nautilus.

Reglas de trabajo:
- Usa la base de conocimiento local como fuente principal.
- Si la respuesta no esta en la base o parece desactualizada, usa Google Search para verificarla.
- Prioriza siempre paginas oficiales de la UMC o el dominio umc.edu.ve cuando exista una fuente oficial.
- Si un enlace en la base tiene un ano viejo como 2022 o 2023, tomalo solo como pista historica y verifica la URL actual antes de responder.
- En temas sensibles al tiempo como pasantias, cronogramas, admision, reingresos e inscripciones, no respondas solo con un enlace historico si existe uno oficial mas reciente.
- No inventes informacion. Si no puedes verificar un dato actual, dilo con claridad.
- Cuando des una respuesta con informacion web actualizada, intenta devolver el enlace vigente y util.
- Si compartes un enlace de la UMC, prioriza el mas reciente que encuentres.
- Si el usuario pide orientacion dentro del campus, puedes apoyarte en el mapa publico de la UMC cuando este disponible.
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
  let response = await createResponse(session.chat, userInput);

  if (shouldRunFreshLinkRetry(userInput, response)) {
    response = await createResponse(
      session.chat,
      buildFreshLinkRetryPrompt(userInput, response.text?.trim() ?? "")
    );
  }

  return extractResponse(response);
}

async function createResponse(
  chat: Chat,
  userInput: string
): Promise<GenerateContentResponse> {
  const message = await buildMessageParts(userInput);
  const baseConfig = {
    tools: [{ googleSearch: {} }],
  };

  if (!shouldRequestThinking(model)) {
    return sendMessageWithRetry(chat, {
      message,
      config: baseConfig,
    });
  }

  try {
    return await sendMessageWithRetry(chat, {
      message,
      config: {
        ...baseConfig,
        thinkingConfig: {
          thinkingLevel: selectThinkingLevel(userInput),
        },
      },
    });
  } catch (error) {
    if (shouldRetryWithoutThinking(model, error)) {
      return sendMessageWithRetry(chat, {
        message,
        config: baseConfig,
      });
    }

    throw error;
  }
}

async function sendMessageWithRetry(
  chat: Chat,
  payload: {
    message: PartListUnion;
    config: {
      tools: Array<{ googleSearch: {} }>;
      thinkingConfig?: { thinkingLevel: ThinkingLevel.HIGH | ThinkingLevel.LOW };
    };
  }
): Promise<GenerateContentResponse> {
  try {
    return await chat.sendMessage(payload);
  } catch (error) {
    if (getErrorStatus(error) === 500) {
      return chat.sendMessage(payload);
    }

    throw error;
  }
}

async function buildMessageParts(userInput: string): Promise<PartListUnion> {
  const campusMapPart = isCampusNavigationQuery(userInput)
    ? await getCampusMapPart()
    : null;
  const instructions = buildDynamicInstructions(userInput, Boolean(campusMapPart));
  const textPart = createPartFromText(
    instructions ? `${userInput}\n\n${instructions}` : userInput
  );

  if (!campusMapPart) {
    return [textPart];
  }

  return [textPart, campusMapPart];
}

function buildDynamicInstructions(
  userInput: string,
  hasCampusMap: boolean
): string {
  const instructions: string[] = [];

  if (shouldForceFreshVerification(userInput)) {
    instructions.push(
      "Antes de responder, verifica en la web oficial de la UMC si existe un enlace o documento vigente sobre este tema. Si hallas una version mas reciente que una historica, usa la mas reciente y deja la historica solo como referencia."
    );
  }

  if (isCampusNavigationQuery(userInput) && hasCampusMap) {
    instructions.push(
      "Usa la imagen adjunta del mapa de la UMC como apoyo visual para orientar al usuario dentro del campus. Si la imagen no alcanza para una ruta exacta, dilo claramente en lugar de inventar."
    );
  }

  return instructions.join(" ");
}

function selectThinkingLevel(
  userInput: string
): ThinkingLevel.HIGH | ThinkingLevel.LOW {
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
    "pasantía",
  ];

  return highThinkingPatterns.some((pattern) => normalizedInput.includes(pattern))
    ? ThinkingLevel.HIGH
    : ThinkingLevel.LOW;
}

function shouldRequestThinking(modelName: string): boolean {
  return modelName.startsWith("gemma-4-") || modelName.startsWith("gemini-");
}

function shouldForceFreshVerification(userInput: string): boolean {
  const normalizedInput = userInput.toLowerCase();

  return [
    "pasant",
    "calend",
    "cronogram",
    "inscrip",
    "reingres",
    "admisi",
    "actual",
    "vigente",
    "enlace",
    "link",
    "url",
    "pdf",
  ].some((pattern) => normalizedInput.includes(pattern));
}

function isCampusNavigationQuery(userInput: string): boolean {
  const normalizedInput = userInput.toLowerCase();

  return [
    "mapa",
    "como llego",
    "cómo llego",
    "como llegar",
    "cómo llegar",
    "donde queda",
    "dónde queda",
    "ubicacion",
    "ubicación",
    "estoy en",
    "talleres",
    "comedor",
    "canchas",
    "edificio administrativo",
    "servicio medico",
    "servicio médico",
  ].some((pattern) => normalizedInput.includes(pattern));
}

function shouldRetryWithoutThinking(modelName: string, error: unknown): boolean {
  if (isThinkingUnsupportedError(error)) {
    return true;
  }

  return modelName.startsWith("gemma-4-") && getErrorStatus(error) === 500;
}

function shouldRunFreshLinkRetry(
  userInput: string,
  response: GenerateContentResponse
): boolean {
  if (!shouldForceFreshVerification(userInput)) {
    return false;
  }

  const text = response.text?.trim();
  if (!text) {
    return false;
  }

  const urls = extractUrlsFromText(text).filter(isUmcUrl);
  const asksForLink = /(link|enlace|url|pdf)/i.test(userInput);
  const hasSpecificCurrentLink = urls.some(
    (url) => !isHistoricalLink(url) && !isGenericUmcUrl(url)
  );
  const hasHistoricalLink = urls.some(isHistoricalLink);

  return hasHistoricalLink || (asksForLink && !hasSpecificCurrentLink);
}

function buildFreshLinkRetryPrompt(userInput: string, previousText: string): string {
  return [
    `Haz una segunda pasada de verificacion para esta consulta: ${userInput}`,
    "La respuesta anterior se quedo en una referencia historica o demasiado general.",
    `Resumen previo: ${previousText}`,
    "Busca otra vez en la web oficial de la UMC y responde con el enlace oficial vigente mas especifico que consigas.",
    "Si solo existe una referencia historica, dilo explicitamente. Si el enlace oficial parece caido o no responde, dilo tambien.",
  ].join(" ");
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

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }

  return undefined;
}

async function extractResponse(
  response: GenerateContentResponse
): Promise<ChatResponse> {
  const text = response.text?.trim();

  if (text) {
    return {
      text,
      sources: await extractSources(response, text),
    };
  }

  throw new Error("El modelo no devolvio texto util para mostrar.");
}

async function extractSources(
  response: GenerateContentResponse,
  text: string
): Promise<SourceReference[]> {
  const sources = new Map<string, { title: string; url: string }>();

  collectLinksFromText(text, sources);

  for (const candidate of response.candidates ?? []) {
    collectCandidateCitations(candidate, sources);
    collectGroundingMetadataSources(candidate, sources);
  }

  const collectedSources = Array.from(sources.values());
  const preferredSources = collectedSources.some(
    (source) => !isVertexSearchUrl(source.url)
  )
    ? collectedSources.filter((source) => !isVertexSearchUrl(source.url))
    : collectedSources;

  return verifySources(preferredSources.slice(0, 6));
}

async function verifySources(
  sourceCandidates: Array<{ title: string; url: string }>
): Promise<SourceReference[]> {
  const verifiedSources = await Promise.all(
    sourceCandidates.map((source) => verifyLink(source))
  );
  const deduplicatedSources = new Map<string, SourceReference>();

  for (const source of verifiedSources) {
    const key = source.resolvedUrl || source.url;

    if (!deduplicatedSources.has(key)) {
      deduplicatedSources.set(key, source);
    }
  }

  return Array.from(deduplicatedSources.values());
}

function collectCandidateCitations(
  candidate: unknown,
  sources: Map<string, { title: string; url: string }>
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
  sources: Map<string, { title: string; url: string }>
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
  sources: Map<string, { title: string; url: string }>,
  title: string,
  url: string
): void {
  if (!sources.has(url)) {
    sources.set(url, { title, url });
  }
}

function collectLinksFromText(
  text: string,
  sources: Map<string, { title: string; url: string }>
): void {
  const markdownRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

  for (const match of text.matchAll(markdownRegex)) {
    const title = match[1]?.trim();
    const url = sanitizeUrl(match[2]);

    if (url) {
      addSource(sources, title || createSourceTitle(url), url);
    }
  }

  for (const url of extractUrlsFromText(text)) {
    if (url) {
      addSource(sources, createSourceTitle(url), url);
    }
  }
}

function extractUrlsFromText(text: string): string[] {
  const plainRegex = /https?:\/\/[^\s)\]]+/g;
  const urls = new Set<string>();

  for (const match of text.matchAll(plainRegex)) {
    const url = sanitizeUrl(match[0]);

    if (url) {
      urls.add(url);
    }
  }

  return Array.from(urls);
}

function sanitizeUrl(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  return url.replace(/^[`"']+|[`"'),.;]+$/g, "");
}

function createSourceTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function verifyLink(source: {
  title: string;
  url: string;
}): Promise<SourceReference> {
  if (!isInterestingLink(source.url)) {
    return {
      title: source.title,
      url: source.url,
      resolvedUrl: source.url,
      status: "no_verificada",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(source.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    const resolvedUrl = response.url || source.url;

    return {
      title: source.title === source.url ? createSourceTitle(resolvedUrl) : source.title,
      url: source.url,
      resolvedUrl,
      status: classifyLinkStatus(response.status),
      httpStatus: response.status,
    };
  } catch {
    return {
      title: source.title,
      url: source.url,
      resolvedUrl: source.url,
      status: isUmcUrl(source.url) ? "caida" : "no_verificada",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyLinkStatus(status: number): SourceReference["status"] {
  if (status >= 200 && status < 400) {
    return "activa";
  }

  if (status === 401 || status === 403 || status === 405) {
    return "no_verificada";
  }

  return "caida";
}

function isInterestingLink(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    return (
      hostname.includes("umc.edu.ve") ||
      hostname.includes("drive.google.com") ||
      hostname.includes("drive.usercontent.google.com") ||
      hostname.includes("docs.google.com") ||
      hostname.includes("vertexaisearch.cloud.google.com")
    );
  } catch {
    return false;
  }
}

function isVertexSearchUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("vertexaisearch.cloud.google.com");
  } catch {
    return false;
  }
}

function isUmcUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("umc.edu.ve");
  } catch {
    return false;
  }
}

function isHistoricalLink(url: string): boolean {
  const currentYear = new Date().getFullYear();
  const years = url.match(/20\d{2}/g) ?? [];

  return years.some((year) => Number(year) < currentYear);
}

function isGenericUmcUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";

    return pathname === "/" || pathname === "/index.php";
  } catch {
    return false;
  }
}

async function getCampusMapPart(): Promise<Part | null> {
  cachedCampusMapPartPromise ??= downloadCampusMapPart();

  try {
    return await cachedCampusMapPartPromise;
  } catch {
    cachedCampusMapPartPromise = Promise.resolve(null);
    return null;
  }
}

async function downloadCampusMapPart(): Promise<Part | null> {
  try {
    const fileId = extractGoogleDriveFileId(CAMPUS_MAP_DRIVE_URL);

    if (!fileId) {
      return null;
    }

    const response = await fetch(
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      { redirect: "follow" }
    );

    if (!response.ok) {
      return null;
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim();

    if (!mimeType || !mimeType.startsWith("image/")) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return createPartFromBase64(buffer.toString("base64"), mimeType);
  } catch {
    return null;
  }
}

function extractGoogleDriveFileId(url: string): string | null {
  const match = url.match(/\/d\/([^/]+)/);
  return match?.[1] ?? null;
}