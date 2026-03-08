import type { LsValue, SpCall } from './types';

/**
 * Decode Lightspeed bytecode from `/ls_resp` into stored procedure calls.
 *
 * The bytecode is a nested array structure with opcodes:
 * - 1: Sequence block `[1, ...sub-steps]`
 * - 2: Comparison value `[2, value]`
 * - 4: Call setup `[4, 0, 1, [5, ...]]`
 * - 5: SP call `[5, "name", arg0, arg1, ...]`
 * - 9: Null literal `[9]`
 * - 19: Bigint `[19, "digits"]`
 * - 23: Conditional `[23, [2, cond], [1, ...body]]`
 */
export function decodeBytecode(step: unknown[], spList: string[]): SpCall[] {
  const calls: SpCall[] = [];
  walkStep(step, spList, calls);
  return calls;
}

function walkStep(node: unknown[], spList: string[], calls: SpCall[]): void {
  if (!Array.isArray(node) || node.length === 0) return;

  const opcode = node[0];

  switch (opcode) {
    case 1: {
      // Sequence: [1, sub1, sub2, ...]
      for (let i = 1; i < node.length; i++) {
        const sub = node[i];
        if (Array.isArray(sub)) {
          walkStep(sub, spList, calls);
        }
      }
      break;
    }
    case 4: {
      // Call setup: [4, 0, 1, [5, ...]] — the last element contains the SP call
      for (let i = 1; i < node.length; i++) {
        const sub = node[i];
        if (Array.isArray(sub)) {
          walkStep(sub, spList, calls);
        }
      }
      break;
    }
    case 5: {
      // SP call: [5, nameOrIndex, arg0, arg1, ...]
      const nameOrIndex = node[1];
      let name: string;
      if (typeof nameOrIndex === 'string') {
        name = nameOrIndex;
      } else if (typeof nameOrIndex === 'number' && nameOrIndex >= 0 && nameOrIndex < spList.length) {
        name = spList[nameOrIndex]!;
      } else {
        break;
      }

      const args: LsValue[] = [];
      for (let i = 2; i < node.length; i++) {
        args.push(decodeValue(node[i]));
      }
      calls.push({ name, args });
      break;
    }
    case 23: {
      // Conditional: [23, [2, cond], [1, ...body]]
      // Walk the body (index 2) to extract calls
      for (let i = 1; i < node.length; i++) {
        const sub = node[i];
        if (Array.isArray(sub)) {
          walkStep(sub, spList, calls);
        }
      }
      break;
    }
    default:
      // Unknown opcode — try walking children in case they contain nested structures
      for (let i = 1; i < node.length; i++) {
        const sub = node[i];
        if (Array.isArray(sub)) {
          walkStep(sub, spList, calls);
        }
      }
      break;
  }
}

function decodeValue(node: unknown): LsValue {
  if (node === null || node === undefined) return null;
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return node;
  if (typeof node === 'boolean') return node;

  if (Array.isArray(node)) {
    const opcode = node[0];
    if (opcode === 9) return null;           // [9] = null
    if (opcode === 19) return String(node[1]); // [19, "bigint"] = bigint as string
    if (opcode === 2) return decodeValue(node[1]); // [2, value] = comparison value
  }

  return null;
}
