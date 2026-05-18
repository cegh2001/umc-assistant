import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export class ConsoleChat {
  private readonly rl = createInterface({ input, output });

  async ask(prompt: string): Promise<string> {
    const answer = await this.rl.question(prompt);
    return answer.trim();
  }

  close(): void {
    this.rl.close();
  }
}