import fs from "fs";
import readline from "readline";

export async function readNthLines(filePath: string, count: number) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream });

  const lines: string[] = [];

  for await (const line of rl) {
    lines.push(line);
    if (lines.length >= count) {
      rl.close();
    }
  }

  return lines;
}
