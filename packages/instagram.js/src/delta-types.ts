import type { RawMessage, RawUser } from './types';

type NewMessageDelta = {
  type: 'newMessage';
  threadId: string;
  raw: RawMessage;
  userDict: RawUser | null;
};

type DeleteMessageDelta = {
  type: 'deleteMessage';
  threadId: string;
  messageId: string;
};

type ReactionDelta = {
  type: 'reaction';
  action: 'add' | 'remove';
  threadId: string;
  messageId: string;
  senderId: string;
  emoji: string;
};

type ReadReceiptDelta = {
  type: 'readReceipt';
  threadId: string;
  userId: string;
  timestamp: Date;
};

type ThreadUpdateDelta = {
  type: 'threadUpdate';
  threadId: string;
  name?: string;
  muted?: boolean;
};

type ThreadDeleteDelta = {
  type: 'threadDelete';
  threadId: string;
};

export type TypingDelta = {
  type: 'typing';
  threadId: string;
  senderId: string;
  isTyping: boolean;
};

type EditMessageDelta = {
  type: 'editMessage';
  threadId: string;
  messageId: string;
  newText: string;
  oldText: string | null;
};

export type DeltaResult =
  | NewMessageDelta
  | DeleteMessageDelta
  | ReactionDelta
  | ReadReceiptDelta
  | ThreadUpdateDelta
  | ThreadDeleteDelta
  | TypingDelta
  | EditMessageDelta;
