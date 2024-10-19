import { bigintToHex, hexToBigint } from "bigint-conversion";
import Int64 from "node-int64";
import util from "util";
import zlib from "zlib";

const deflatePromise = util.promisify(zlib.deflate);
const unzipPromise = util.promisify(zlib.unzip);

export function deflateAsync(data: string | Buffer) {
  return deflatePromise(data);
}

export function unzipAsync(data: string | Buffer) {
  return unzipPromise(data);
}

export async function safeUnzipAsync(data: Buffer) {
  if (data.readInt8(0) !== 0x78) {
    return data;
  }
  return unzipPromise(data).catch(() => data);
}

export function bigintToInt64(value: bigint) {
  return new Int64(bigintToHex(value));
}

export function int64ToBigint(value: Int64) {
  return hexToBigint(value.toOctetString());
}

export function objectToMap<T>(object: Record<string, T>): Map<string, T> {
  const map = new Map<string, T>();
  for (const [key, value] of Object.entries(object)) {
    map.set(key, value);
  }
  return map;
}

export function bufferIsJson(buffer: Buffer): boolean {
  return !!/[{[]/.exec(String.fromCharCode(buffer[0]!));
}
