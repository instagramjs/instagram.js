import { describe, expect, it } from 'vitest';
import {
  ApiError,
  AuthError,
  DocIdError,
  IgBotError,
  MqttError,
  RateLimitError,
  SessionError,
  TimeoutError,
  ValidationError,
} from './errors';

describe('IgBotError', () => {
  it('sets name, message, and code', () => {
    const err = new IgBotError('something broke', 'SOME_CODE');
    expect(err.name).toBe('IgBotError');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('SOME_CODE');
    expect(err.cause).toBeUndefined();
  });

  it('extends Error', () => {
    const err = new IgBotError('test', 'TEST');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(IgBotError);
  });

  it('accepts an optional cause', () => {
    const cause = new Error('root cause');
    const err = new IgBotError('wrapped', 'WRAP', cause);
    expect(err.cause).toBe(cause);
  });
});

describe('error subclasses', () => {
  const cases: Array<{
    Class: new (msg: string, cause?: Error) => IgBotError;
    name: string;
    code: string;
  }> = [
    { Class: ValidationError, name: 'ValidationError', code: 'VALIDATION_ERROR' },
    { Class: SessionError, name: 'SessionError', code: 'SESSION_ERROR' },
    { Class: AuthError, name: 'AuthError', code: 'AUTH_ERROR' },
    { Class: DocIdError, name: 'DocIdError', code: 'INVALID_DOC_ID' },
    { Class: RateLimitError, name: 'RateLimitError', code: 'RATE_LIMITED' },
    { Class: TimeoutError, name: 'TimeoutError', code: 'TIMEOUT' },
    { Class: MqttError, name: 'MqttError', code: 'MQTT_ERROR' },
    { Class: ApiError, name: 'ApiError', code: 'API_ERROR' },
  ];

  for (const { Class, name, code } of cases) {
    it(`${name} has correct name and code`, () => {
      const err = new Class('test message');
      expect(err.name).toBe(name);
      expect(err.code).toBe(code);
      expect(err.message).toBe('test message');
    });

    it(`${name} extends IgBotError and Error`, () => {
      const err = new Class('test');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(IgBotError);
      expect(err).toBeInstanceOf(Class);
    });

    it(`${name} accepts a cause`, () => {
      const cause = new Error('underlying');
      const err = new Class('wrapped', cause);
      expect(err.cause).toBe(cause);
    });
  }
});
