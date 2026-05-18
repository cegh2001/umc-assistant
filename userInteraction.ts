import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export class ConsoleChat {
  private readonly rl = createInterface({ input, output });

  async ask(prompt: string): Promise<string | null> {
    try {
      const answer = await this.rl.question(prompt);
      return answer.trim();
    } catch (error) {
      if (isReadlineClosedError(error)) {
        return null;
      }

      throw error;
    }
  }

  close(): void {
    this.rl.close();
  }
}

function isReadlineClosedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  return (
    "code" in error &&
    ((error as { code?: unknown }).code === "ERR_USE_AFTER_CLOSE" ||
      (error as { code?: unknown }).code === "ABORT_ERR")
  );
}