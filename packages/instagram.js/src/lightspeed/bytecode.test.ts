import { describe, expect, it } from 'vitest';
import { decodeBytecode } from './bytecode';

describe('decodeBytecode', () => {
  it('decodes a simple SP call', () => {
    const step = [1, [5, 0, 'hello', [19, '12345'], true, [9]]];
    const spList = ['insertMessage'];
    const calls = decodeBytecode(step, spList);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('insertMessage');
    expect(calls[0]!.args).toEqual(['hello', '12345', true, null]);
  });

  it('decodes SP by name when name is a string', () => {
    const step = [1, [5, 'taskExists', 'abc']];
    const calls = decodeBytecode(step, []);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('taskExists');
    expect(calls[0]!.args).toEqual(['abc']);
  });

  it('resolves SP index from spList', () => {
    const step = [1, [5, 1, 'arg1']];
    const spList = ['executeFirstBlockForSyncTransaction', 'executeFinallyBlockForSyncTransaction'];
    const calls = decodeBytecode(step, spList);

    expect(calls[0]!.name).toBe('executeFinallyBlockForSyncTransaction');
  });

  it('handles nested sequence blocks', () => {
    const step = [1,
      [1,
        [5, 0, 'a'],
        [5, 1, 'b'],
      ],
      [5, 0, 'c'],
    ];
    const spList = ['sp1', 'sp2'];
    const calls = decodeBytecode(step, spList);

    expect(calls).toHaveLength(3);
    expect(calls[0]!.name).toBe('sp1');
    expect(calls[1]!.name).toBe('sp2');
    expect(calls[2]!.name).toBe('sp1');
  });

  it('handles call setup (opcode 4)', () => {
    const step = [1, [4, 0, 1, [5, 0, 'val']]];
    const spList = ['myProc'];
    const calls = decodeBytecode(step, spList);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('myProc');
  });

  it('handles conditional (opcode 23)', () => {
    const step = [1,
      [23,
        [2, true],
        [1, [5, 0, 'condArg']],
      ],
    ];
    const spList = ['condProc'];
    const calls = decodeBytecode(step, spList);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('condProc');
  });

  it('decodes null values (opcode 9)', () => {
    const step = [1, [5, 0, [9], [9], 'text']];
    const spList = ['proc'];
    const calls = decodeBytecode(step, spList);

    expect(calls[0]!.args).toEqual([null, null, 'text']);
  });

  it('decodes bigint values (opcode 19)', () => {
    const step = [1, [5, 0, [19, '9876543210123456789']]];
    const spList = ['proc'];
    const calls = decodeBytecode(step, spList);

    expect(calls[0]!.args).toEqual(['9876543210123456789']);
  });

  it('decodes comparison values (opcode 2)', () => {
    const step = [1, [5, 0, [2, 42]]];
    const spList = ['proc'];
    const calls = decodeBytecode(step, spList);

    expect(calls[0]!.args).toEqual([42]);
  });

  it('handles empty step', () => {
    expect(decodeBytecode([], [])).toEqual([]);
  });

  it('handles boolean args', () => {
    const step = [1, [5, 0, true, false]];
    const spList = ['proc'];
    const calls = decodeBytecode(step, spList);

    expect(calls[0]!.args).toEqual([true, false]);
  });

  it('handles numeric args', () => {
    const step = [1, [5, 0, 0, 80, 2]];
    const spList = ['proc'];
    const calls = decodeBytecode(step, spList);

    expect(calls[0]!.args).toEqual([0, 80, 2]);
  });

  it('decodes a realistic insertMessage bytecode', () => {
    const step = [1,
      [4, 0, 1,
        [5, 0,
          'Hello world',     // arg0: text
          [9],               // arg1: null
          [19, '80'],        // arg2: type
          [19, '110321187034821'], // arg3: threadKey
          [19, '0'],         // arg4
          [19, '1772963677067'],   // arg5: timestamp
          [19, '1772963677067'],   // arg6: timestamp
          [9],               // arg7: null
          'mid.$abc123',     // arg8: messageId
          '7436348398150181709', // arg9: otid
          [19, '100105558060154'], // arg10: senderId
        ],
      ],
    ];
    const spList = ['insertMessage'];
    const calls = decodeBytecode(step, spList);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe('insertMessage');
    expect(calls[0]!.args[0]).toBe('Hello world');
    expect(calls[0]!.args[1]).toBeNull();
    expect(calls[0]!.args[2]).toBe('80');
    expect(calls[0]!.args[3]).toBe('110321187034821');
    expect(calls[0]!.args[8]).toBe('mid.$abc123');
    expect(calls[0]!.args[10]).toBe('100105558060154');
  });

  it('decodes multiple SP calls from a single response', () => {
    // Simulates a typical ls_resp with sync transaction + message + thread snippet
    const step = [1,
      [5, 0, [19, '1'], [9], [9], [9], [9], [9], [9], [9], [9], [9]],
      [5, 1, 'Hello', [9], [19, '80'], [19, '12345']],
      [5, 2, [19, '12345'], 'Hello', [19, '80']],
      [5, 3, [19, '1'], [9], [19, '1']],
    ];
    const spList = [
      'executeFirstBlockForSyncTransaction',
      'insertMessage',
      'updateThreadSnippet',
      'executeFinallyBlockForSyncTransaction',
    ];
    const calls = decodeBytecode(step, spList);

    expect(calls).toHaveLength(4);
    expect(calls[0]!.name).toBe('executeFirstBlockForSyncTransaction');
    expect(calls[1]!.name).toBe('insertMessage');
    expect(calls[2]!.name).toBe('updateThreadSnippet');
    expect(calls[3]!.name).toBe('executeFinallyBlockForSyncTransaction');
  });
});
