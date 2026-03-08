import { describe, expect, it } from 'vitest';
import { APP_ID } from '../constants';
import {
  buildSendMessageTask,
  buildMarkReadTask,
  buildSearchPrimaryTask,
  buildSearchSecondaryTask,
  buildFetchRequestQueueTask,
  buildFetchContactTask,
  buildFetchThreadTask,
  buildFetchMessageRangeTask,
  buildAddParticipantTask,
  buildPinMessageTask,
  buildLsRequestEnvelope,
  buildLsSyncEnvelope,
  buildLsTypingEnvelope,
} from './task-builder';

describe('buildSendMessageTask', () => {
  it('creates a label 46 task', () => {
    const task = buildSendMessageTask({
      threadId: '12345',
      text: 'Hello',
      otid: '999',
    });

    expect(task.label).toBe('46');
    expect(task.queue_name).toBe('12345');
    expect(task.payload['text']).toBe('Hello');
    expect(task.payload['otid']).toBe('999');
    expect(task.payload['thread_id']).toBe(12345);
    expect(task.payload['source']).toBe(65537);
    expect(task.payload['send_type']).toBe(1);
  });

  it('includes reply metadata', () => {
    const task = buildSendMessageTask({
      threadId: '12345',
      text: 'Reply',
      otid: '999',
      replyToId: 'mid.original',
    });

    const reply = task.payload['reply_metadata'] as Record<string, unknown>;
    expect(reply['reply_source_id']).toBe('mid.original');
    expect(reply['reply_source_type']).toBe(1);
  });

  it('detects links in text', () => {
    const task = buildSendMessageTask({
      threadId: '12345',
      text: 'Check https://example.com',
      otid: '999',
    });

    expect(task.payload['text_has_links']).toBe(1);
  });
});

describe('buildMarkReadTask', () => {
  it('creates a label 21 task', () => {
    const task = buildMarkReadTask('12345', '1772963195490');

    expect(task.label).toBe('21');
    expect(task.queue_name).toBe('12345');
    expect(task.payload['thread_id']).toBe(12345);
    expect(task.payload['last_read_watermark_ts']).toBe(1772963195490);
  });
});

describe('buildSearchPrimaryTask', () => {
  it('creates a label 30 task', () => {
    const task = buildSearchPrimaryTask('test query');

    expect(task.label).toBe('30');
    expect(task.queue_name).toBe('search_primary');
    expect(task.payload['query']).toBe('test query');
    expect(task.payload['supported_types']).toHaveLength(10);
  });
});

describe('buildSearchSecondaryTask', () => {
  it('creates a label 31 task', () => {
    const task = buildSearchSecondaryTask('query');
    expect(task.label).toBe('31');
    expect(task.queue_name).toBe('search_secondary');
  });
});

describe('buildFetchRequestQueueTask', () => {
  it('creates a label 145 task', () => {
    const task = buildFetchRequestQueueTask();

    expect(task.label).toBe('145');
    expect(task.queue_name).toBe('trq');
    expect(task.payload['parent_thread_key']).toBe(-1);
    expect(task.payload['reference_activity_timestamp']).toBe(9999999999999);
  });
});

describe('buildFetchContactTask', () => {
  it('creates a label 207 task', () => {
    const task = buildFetchContactTask('17844242913114269');
    expect(task.label).toBe('207');
    expect(task.payload['contact_id']).toBe(17844242913114269);
  });
});

describe('buildFetchThreadTask', () => {
  it('creates a label 209 task', () => {
    const task = buildFetchThreadTask('110321187034821');

    expect(task.label).toBe('209');
    expect(task.queue_name).toBe('110321187034821');
    expect(task.payload['thread_fbid']).toBe(110321187034821);
    expect(task.payload['force_upsert']).toBe(0);
  });
});

describe('buildFetchMessageRangeTask', () => {
  it('creates a label 228 task', () => {
    const task = buildFetchMessageRangeTask({
      threadKey: '12345',
      referenceTimestampMs: '1772963083553',
      referenceMessageId: 'mid.$abc',
    });

    expect(task.label).toBe('228');
    expect(task.queue_name).toBe('mrq.12345');
    expect(task.payload['thread_key']).toBe(12345);
    expect(task.payload['reference_timestamp_ms']).toBe(1772963083553);
  });
});

describe('buildAddParticipantTask', () => {
  it('creates a label 130 task', () => {
    const task = buildAddParticipantTask('12345', ['111', '222']);

    expect(task.label).toBe('130');
    expect(task.payload['participants']).toEqual([111, 222]);
  });
});

describe('buildPinMessageTask', () => {
  it('creates a label 751 task for pinning', () => {
    const task = buildPinMessageTask('12345', 'mid.$abc', true);

    expect(task.label).toBe('751');
    expect(task.payload['pinned_message_state']).toBe(1);
  });

  it('creates a label 751 task for unpinning', () => {
    const task = buildPinMessageTask('12345', 'mid.$abc', false);
    expect(task.payload['pinned_message_state']).toBe(0);
  });
});

describe('buildLsRequestEnvelope', () => {
  it('produces a type 3 envelope with double-encoded tasks', () => {
    const task = buildSendMessageTask({
      threadId: '12345',
      text: 'Hi',
      otid: '999',
    });

    const envelope = buildLsRequestEnvelope({
      tasks: [task],
      epochId: '7436348146209605364',
      requestId: 10,
    });

    expect(envelope.app_id).toBe(APP_ID);
    expect(envelope.type).toBe(3);
    expect(envelope.request_id).toBe(10);

    // payload is JSON-encoded string
    const payload = JSON.parse(envelope.payload);
    expect(payload.epoch_id).toBe(7436348146209605364);
    expect(payload.tasks).toHaveLength(1);

    // Each task's payload and queue_name are also JSON-encoded strings
    const taskPayload = JSON.parse(payload.tasks[0].payload);
    expect(taskPayload.text).toBe('Hi');

    const queueName = JSON.parse(payload.tasks[0].queue_name);
    expect(queueName).toBe('12345');
  });

  it('assigns sequential task_ids', () => {
    const t1 = buildSendMessageTask({ threadId: '1', text: 'a', otid: '1' });
    const t2 = buildMarkReadTask('1', '1000');

    const envelope = buildLsRequestEnvelope({
      tasks: [t1, t2],
      epochId: '1',
      requestId: 1,
    });

    const payload = JSON.parse(envelope.payload);
    expect(payload.tasks[0].task_id).toBe(0);
    expect(payload.tasks[1].task_id).toBe(1);
  });
});

describe('buildLsSyncEnvelope', () => {
  it('produces a type 1 sync envelope', () => {
    const envelope = buildLsSyncEnvelope({
      database: 89,
      epochId: '12345',
      requestId: 1,
      lastAppliedCursor: 'cursor_abc',
    });

    expect(envelope.type).toBe(1);
    const payload = JSON.parse(envelope.payload);
    expect(payload.database).toBe(89);
    expect(payload.last_applied_cursor).toBe('cursor_abc');
  });
});

describe('buildLsTypingEnvelope', () => {
  it('produces a type 2 typing envelope', () => {
    const envelope = buildLsTypingEnvelope(
      { threadKey: '12345', isGroupThread: false, isTyping: true },
      5,
    );

    expect(envelope.type).toBe(2);
    expect(envelope.request_id).toBe(5);

    const payload = JSON.parse(envelope.payload);
    expect(payload.label).toBe('3');

    const innerPayload = JSON.parse(payload.payload);
    expect(innerPayload.thread_key).toBe(12345);
    expect(innerPayload.is_typing).toBe(1);
    expect(innerPayload.is_group_thread).toBe(0);
  });
});
