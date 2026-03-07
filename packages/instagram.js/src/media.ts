import { ValidationError } from './errors';
import { HttpClient } from './http';
import type { Message } from './models/message';
import { createMessage } from './models/message';
import { User } from './models/user';
import type { Client } from './client';
import type { RawMessage } from './types';
import { generateMutationToken, generateOfflineThreadingId } from './utils';

export type PhotoContent = {
  photo: Buffer;
  filename?: string;
};

export type VideoContent = {
  video: Buffer;
  filename?: string;
};

export type GifContent = {
  gif: string;
  isSticker?: boolean;
};

export type VoiceContent = {
  voice: Buffer;
  duration: number;
  waveform?: number[];
};

export type LinkContent = {
  link: string;
  text?: string;
};

export type SendContent =
  | PhotoContent
  | VideoContent
  | GifContent
  | VoiceContent
  | LinkContent;

/** Detect which content type a SendContent object represents. */
export function detectContentType(
  content: SendContent,
): 'photo' | 'video' | 'gif' | 'voice' | 'link' {
  if ('photo' in content) {
    return 'photo';
  }
  if ('video' in content) {
    return 'video';
  }
  if ('gif' in content) {
    return 'gif';
  }
  if ('voice' in content) {
    return 'voice';
  }
  if ('link' in content) {
    return 'link';
  }
  throw new ValidationError('SendContent must have one of: photo, video, gif, voice, link');
}

type SendMediaInput = {
  http: HttpClient;
  threadId: string;
  client?: Client;
};

/** Send a photo: upload then broadcast. */
export async function sendPhoto(
  input: SendMediaInput & { photo: Buffer; filename?: string },
): Promise<Message> {
  const { http, threadId, photo, client } = input;
  const uploadResult = await http.upload(photo, input.filename ?? 'photo.jpg');

  const result = await http.rest<RawMessage>(
    '/api/v1/direct_v2/threads/broadcast/configure_photo/',
    {
      method: 'POST',
      body: {
        action: 'send_item',
        allow_full_aspect_ratio: '1',
        content_type: 'photo',
        mutation_token: generateMutationToken(),
        sampled: '1',
        thread_id: threadId,
        upload_id: uploadResult.id,
      },
    },
  );

  return createMessageFromBroadcast(result, threadId, client);
}

/** Send a video: upload then broadcast. */
export async function sendVideo(
  input: SendMediaInput & { video: Buffer; filename?: string },
): Promise<Message> {
  const { http, threadId, video, client } = input;
  const uploadResult = await http.upload(video, input.filename ?? 'video.mp4');

  const result = await http.rest<RawMessage>(
    '/api/v1/direct_v2/threads/broadcast/configure_photo/',
    {
      method: 'POST',
      body: {
        action: 'send_item',
        content_type: 'video',
        mutation_token: generateMutationToken(),
        thread_id: threadId,
        upload_id: uploadResult.id,
      },
    },
  );

  return createMessageFromBroadcast(result, threadId, client);
}

/** Send a GIF by Giphy/Tenor ID. */
export async function sendGif(
  input: SendMediaInput & { gifId: string; isSticker?: boolean },
): Promise<Message> {
  const { http, threadId, gifId, client } = input;
  const clientContext = generateOfflineThreadingId();

  const result = await http.rest<RawMessage>(
    '/api/v1/direct_v2/threads/broadcast/animated_media/',
    {
      method: 'POST',
      body: {
        action: 'send_item',
        client_context: clientContext,
        id: gifId,
        is_sticker: String(input.isSticker ?? false),
        mutation_token: clientContext,
        replied_to_client_context: '',
        replied_to_item_id: '',
        send_attribution: '',
        thread_id: threadId,
      },
    },
  );

  return createMessageFromBroadcast(result, threadId, client);
}

/** Send a voice message: upload then send. */
export async function sendVoice(
  input: SendMediaInput & { voice: Buffer; duration: number; waveform?: number[] },
): Promise<Message> {
  const { http, threadId, voice, duration, client } = input;
  const waveformData = input.waveform ?? new Array<number>(20).fill(0);

  const uploadResult = await http.upload(
    voice,
    `audioclip-${Date.now()}.ogg`,
    {
      voice_clip: 'true',
      voice_clip_waveform_data: JSON.stringify({ amplitudes: waveformData }),
    },
  );

  const result = await http.rest<RawMessage>(
    '/api/v1/direct_v2/threads/broadcast/configure_photo/',
    {
      method: 'POST',
      body: {
        action: 'send_item',
        content_type: 'voice_media',
        mutation_token: generateMutationToken(),
        thread_id: threadId,
        upload_id: uploadResult.id,
        voice_clip_duration: String(duration),
      },
    },
  );

  return createMessageFromBroadcast(result, threadId, client);
}

/** Send a link. */
export async function sendLink(
  input: SendMediaInput & { url: string; text?: string },
): Promise<Message> {
  const { http, threadId, url, client } = input;

  const result = await http.rest<RawMessage>(
    '/api/v1/direct_v2/threads/broadcast/link/',
    {
      method: 'POST',
      body: {
        action: 'send_item',
        client_context: generateOfflineThreadingId(),
        link_text: input.text ?? '',
        link_urls: JSON.stringify([url]),
        mutation_token: generateMutationToken(),
        thread_id: threadId,
      },
    },
  );

  return createMessageFromBroadcast(result, threadId, client);
}

function createMessageFromBroadcast(
  raw: RawMessage,
  threadId: string,
  client?: Client,
): Message {
  const filled: RawMessage = {
    ...raw,
    item_id: raw.item_id ?? '',
    user_id: raw.user_id ?? '0',
    timestamp: raw.timestamp ?? String(Date.now() * 1000),
    item_type: raw.item_type ?? 'text',
  };
  const author = new User({ id: String(filled.user_id), partial: true, ...(client !== undefined ? { client } : {}) });
  return createMessage({ raw: filled, threadId, author, ...(client !== undefined ? { client } : {}) });
}
