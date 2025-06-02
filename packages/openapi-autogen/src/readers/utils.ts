import fs from "fs";
import readline from "readline";

export function readNthLines(filePath: string, count: number) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream });
  const lines: string[] = [];

  rl.on("line", (line) => {
    lines.push(line);
    if (lines.length >= count) {
      rl.close();
    }
  });

  return new Promise<string[]>((resolve) => {
    rl.on("close", () => {
      resolve(lines);
    });
  });
}
