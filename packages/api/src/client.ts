import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import axiosCookieJar from "axios-cookiejar-support";
import { Chance } from "chance";
import { createHmac, randomInt, randomUUID } from "crypto";
import EventEmitter from "eventemitter3";
import { type ParsedUrlQueryInput, stringify } from "querystring";
import { CookieJar, type SerializedCookieJar } from "tough-cookie";
import { z } from "zod";

import { AccountApi } from "./api/account";
import { DirectApi } from "./api/direct/api";
import { QeApi } from "./api/qe";
import {
  API_URL,
  APP_VERSION,
  APP_VERSION_CODE,
  BLOKS_VERSION_ID,
  BUILDS,
  CAPABILITIES_HEADER,
  CLIENT_SESSION_ID_LIFETIME,
  CONNECTION_TYPE_HEADER,
  DEVICES,
  FB_ANALYTICS_APPLICATION_ID,
  LANGUAGE,
  PIGEON_SESSION_ID_LIFETIME,
  SIGNATURE_KEY,
  SIGNATURE_VERSION,
} from "./constants";

const authStateSchema = z.object({
  token: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  shouldUserHeaderOverCookie: z.string().optional(),
});
export type AuthState = z.infer<typeof authStateSchema>;

const deviceStateSchema = z.object({
  deviceString: z.string(),
  uuid: z.string(),
  phoneId: z.string(),
  adId: z.string(),
  build: z.string(),
  deviceId: z.string(),
});
export type DeviceState = z.infer<typeof deviceStateSchema>;

const passwordEncryptionConfigSchema = z.object({
  pubKey: z.string(),
  keyId: z.string(),
});
export type PasswordEncryptionConfig = z.infer<
  typeof passwordEncryptionConfigSchema
>;

const stateSchema = z.object({
  authState: authStateSchema.nullable(),
  passwordEncryptionConfig: passwordEncryptionConfigSchema.nullable(),
  deviceState: deviceStateSchema,
  cookieJar: z.unknown(),
});
export type State = z.infer<typeof stateSchema>;

export type ApiClientEvents = {
  requestEnd: () => void;
};

export class ApiClient extends EventEmitter<ApiClientEvents> {
  #igWWWClaim: string | null = null;

  authState: AuthState | null = null;
  passwordEncryptionConfig: PasswordEncryptionConfig | null = null;
  deviceState: DeviceState = this.generateDevice(randomUUID());

  cookieJar = new CookieJar();
  axiosClient = axiosCookieJar.wrapper(
    axios.create({
      jar: this.cookieJar,
      baseURL: API_URL,
    }),
  );

  qe = new QeApi(this);
  account = new AccountApi(this);
  direct = new DirectApi(this);

  generateDevice(seed: string): DeviceState {
    const chance = new Chance(seed);
    const newDeviceState = {
      deviceString: chance.pickone(DEVICES),
      uuid: chance.guid(),
      phoneId: chance.guid(),
      adId: chance.guid(),
      build: chance.pickone(BUILDS),
      deviceId: `android-${chance.string({
        pool: "abcdef0123456789",
        length: 16,
      })}`,
    };
    return newDeviceState;
  }

  #generateTemporaryGuid(seed: string, lifetimeMs: number) {
    return new Chance(
      `${seed}${this.deviceState.deviceId}${Math.round(Date.now() / lifetimeMs)}`,
    ).guid();
  }

  getClientSessionId() {
    return this.#generateTemporaryGuid(
      "client-session-id",
      CLIENT_SESSION_ID_LIFETIME,
    );
  }

  getPigeonSessionId() {
    return this.#generateTemporaryGuid(
      "pigeon-session-id",
      PIGEON_SESSION_ID_LIFETIME,
    );
  }

  extractCookie(key: string) {
    return this.cookieJar.getCookiesSync(API_URL).find((c) => c.key === key);
  }

  extractCookieValue(key: string) {
    const cookie = this.extractCookie(key);
    return cookie?.value ?? null;
  }

  getUserId() {
    return (
      this.extractCookieValue("ds_user_id") ?? this.authState?.userId ?? null
    );
  }

  getCsrfToken() {
    return this.extractCookieValue("csrftoken");
  }

  getUserAgent() {
    return `Instagram ${APP_VERSION} Android (${this.deviceState.deviceString}; ${LANGUAGE}; ${APP_VERSION_CODE})`;
  }

  signFormData(data: Record<string, unknown> | string) {
    const json = typeof data === "object" ? JSON.stringify(data) : data;
    const signature = createHmac("sha256", SIGNATURE_KEY)
      .update(json)
      .digest("hex");
    return {
      ig_sig_key_version: SIGNATURE_VERSION,
      signed_body: `${signature}.${json}`,
    };
  }

  exportState(): State {
    return {
      authState: this.authState ? { ...this.authState } : null,
      passwordEncryptionConfig: this.passwordEncryptionConfig
        ? { ...this.passwordEncryptionConfig }
        : null,
      deviceState: { ...this.deviceState },
      cookieJar: this.cookieJar.serializeSync(),
    };
  }

  importState(state: State) {
    const parsedState = stateSchema.parse(state);
    this.authState = parsedState.authState;
    this.passwordEncryptionConfig = parsedState.passwordEncryptionConfig;
    this.deviceState = parsedState.deviceState;
    this.cookieJar = CookieJar.deserializeSync(
      parsedState.cookieJar as SerializedCookieJar,
    );
    this.axiosClient = axiosCookieJar.wrapper(
      axios.create({
        jar: this.cookieJar,
        baseURL: API_URL,
      }),
    );
  }

  #getBaseHeaders() {
    return {
      "User-Agent": this.getUserAgent(),
      "X-Ads-Opt-Out": "0",
      "X-CM-Bandwidth-KBPS": "-1.000",
      "X-CM-Latency": "-1.000",
      "X-IG-App-Locale": LANGUAGE,
      "X-IG-Device-Locale": LANGUAGE,
      "X-Pigeon-Session-Id": this.getPigeonSessionId(),
      "X-Pigeon-Rawclienttime": (Date.now() / 1000).toFixed(3),
      "X-IG-Connection-Speed": `${randomInt(1000, 3700)}kbps`,
      "X-IG-Bandwidth-Speed-KBPS": "-1.000",
      "X-IG-Bandwidth-TotalBytes-B": "0",
      "X-IG-Bandwidth-TotalTime-MS": "0",
      "X-IG-EU-DC-ENABLED": "0",
      // 'X-IG-Extended-CDN-Thumbnail-Cache-Busting-Value': this.client.state.thumbnailCacheBustingValue.toString(),
      "X-Bloks-Version-Id": BLOKS_VERSION_ID,
      "X-MID": this.extractCookieValue("mid") ?? "",
      "X-IG-WWW-Claim": this.#igWWWClaim ?? ")",
      "X-Bloks-Is-Layout-RTL": "false",
      "X-IG-Connection-Type": CONNECTION_TYPE_HEADER,
      "X-IG-Capabilities": CAPABILITIES_HEADER,
      "X-IG-App-ID": FB_ANALYTICS_APPLICATION_ID,
      "X-IG-Device-ID": this.deviceState.uuid,
      "X-IG-Android-ID": this.deviceState.deviceId,
      "Accept-Language": LANGUAGE.replace("_", "-"),
      "X-FB-HTTP-Engine": "Liger",
      Authorization: this.authState?.token,
      Host: "i.instagram.com",
      "Accept-Encoding": "gzip",
      Connection: "close",
    };
  }

  #updateAuthState(response: AxiosResponse) {
    const {
      "x-ig-set-www-claim": wwwClaim,
      "ig-set-authorization": authToken,
      "ig-set-password-encryption-key-id": pwKeyId,
      "ig-set-password-encryption-pub-key": pwPubKey,
    } = response.headers;

    if (typeof wwwClaim === "string") {
      this.#igWWWClaim = wwwClaim;
    }
    if (typeof authToken === "string") {
      try {
        const parsedAuth = parseAuthToken(authToken);
        this.authState = {
          token: authToken,
          userId: parsedAuth.ds_user_id,
          sessionId: parsedAuth.sessionid,
          shouldUserHeaderOverCookie: parsedAuth.should_user_header_over_cookie,
        };
      } catch {
        throw new Error(`Failed to parse auth token: ${authToken}`);
      }
    }
    if (typeof pwKeyId === "string" && typeof pwPubKey === "string") {
      this.passwordEncryptionConfig = {
        keyId: pwKeyId,
        pubKey: pwPubKey,
      };
    }
  }

  async makeRequest<R = unknown>(
    opts?: AxiosRequestConfig & {
      form?: ParsedUrlQueryInput;
    },
  ) {
    const baseHeaders = this.#getBaseHeaders();
    const response = await this.axiosClient.request<R>({
      ...opts,
      headers: {
        ...baseHeaders,
        ...opts?.headers,
      },
      data: opts?.form ? stringify(opts.form) : (opts?.data as unknown),
    });
    this.#updateAuthState(response);
    this.emit("requestEnd");

    return response.data;
  }
}

function parseAuthToken(token: string) {
  return JSON.parse(
    Buffer.from(token.substring("Bearer IGT:2:".length), "base64").toString(),
  ) as {
    ds_user_id: string;
    sessionid: string;
    should_user_header_over_cookie: string;
  };
}
