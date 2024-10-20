import thriftTs from "@creditkarma/thrift-typescript";
import fs from "fs/promises";
import { glob } from "glob";
import path from "path";
import * as prettier from "prettier";

const THRIFT_DIR = path.join(import.meta.dirname, "../thrift");
const OUT_DIR = path.join(import.meta.dirname, "../src/thrift");

const HEADER = `/* eslint-disable */
import thrift from "thrift";
import Int64 from "node-int64";

`;

async function main() {
  const thriftFilePaths = await glob(path.join(THRIFT_DIR, "**/*.thrift"));
  const prettierConfig = await prettier.resolveConfig(
    path.join(import.meta.filename),
  );
  if (!prettierConfig) {
    throw new Error("Could not resolve prettier config");
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const filePath of thriftFilePaths) {
    const data = await fs.readFile(filePath, "utf-8");
    const name = path.basename(filePath).split(".")[0];
    const code = HEADER + thriftTs.make(data, { library: "thrift" });
    const prettyCode = await prettier.format(code, {
      ...prettierConfig,
      parser: "typescript",
    });

    await fs.writeFile(path.join(OUT_DIR, `${name}.ts`), prettyCode, "utf-8");
  }
}

void main();
