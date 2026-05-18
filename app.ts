import { bootstrapChatSession, sendChatMessage } from "./aiIntegration.js";
import { loadKnowledgeBase } from "./knowledgeBase.js";
import { ConsoleChat } from "./userInteraction.js";

async function main(): Promise<void> {
  const knowledgeBase = await loadKnowledgeBase();
  const consoleChat = new ConsoleChat();

  try {
    const session = await bootstrapChatSession(knowledgeBase);
    console.log("UMC Assistant listo. Escribe tu pregunta o 'salir'.");

    while (true) {
      const userInput = await consoleChat.ask("Tú: ");

      if (!userInput) {
        continue;
      }

      if (userInput.toLowerCase() === "salir") {
        break;
      }

      const response = await sendChatMessage(session, userInput);
      console.log(`Gemini: ${response}`);
    }
  } catch (error) {
    handleError(error);
    process.exitCode = 1;
  } finally {
    consoleChat.close();
  }
}

function handleError(error: unknown): void {
  console.error("Error durante la conversación:", error);

  const status = getErrorStatus(error);
  if (status === 429 || status === 503 || status === 500) {
    console.log(
      "Gemini: El servicio no esta disponible temporalmente. Intenta nuevamente en unos minutos."
    );
    return;
  }

  console.log(
    "Gemini: Ocurrio un error al procesar tu solicitud. Intenta nuevamente con otra pregunta."
  );
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }

  if (
    "response" in error &&
    typeof (error as { response?: unknown }).response === "object" &&
    (error as { response?: object }).response !== null &&
    "status" in ((error as { response: { status?: unknown } }).response) &&
    typeof (error as { response: { status?: unknown } }).response.status === "number"
  ) {
    return (error as { response: { status: number } }).response.status;
  }

  return undefined;
}

void main();