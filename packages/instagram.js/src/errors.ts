/**
 * Base error class for all instagram.js errors.
 */
export class IgBotError extends Error {
  readonly code: string;
  override readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = 'IgBotError';
    this.code = code;
    this.cause = cause;
  }
}

/** Missing or invalid input (cookies, options). */
export class ValidationError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

/** Failed to extract session values from page. */
export class SessionError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'SESSION_ERROR', cause);
    this.name = 'SessionError';
  }
}

/** Server rejected auth (expired cookies, banned account). */
export class AuthError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', cause);
    this.name = 'AuthError';
  }
}

/** GraphQL request failed due to invalid doc_id. */
export class DocIdError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'INVALID_DOC_ID', cause);
    this.name = 'DocIdError';
  }
}

/** Server rate-limited the request. */
export class RateLimitError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'RATE_LIMITED', cause);
    this.name = 'RateLimitError';
  }
}

/** MQTT send response or HTTP request timed out. */
export class TimeoutError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'TIMEOUT', cause);
    this.name = 'TimeoutError';
  }
}

/** MQTT connection or protocol error. */
export class MqttError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'MQTT_ERROR', cause);
    this.name = 'MqttError';
  }
}

/** Generic server error (5xx, unexpected response). */
export class ApiError extends IgBotError {
  constructor(message: string, cause?: Error) {
    super(message, 'API_ERROR', cause);
    this.name = 'ApiError';
  }
}
