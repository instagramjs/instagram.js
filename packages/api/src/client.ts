import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";
import axiosCookieJar from "axios-cookiejar-support";
import { Chance } from "chance";
import { createHmac, randomInt, randomUUID } from "crypto";
import EventEmitter from "eventemitter3";
import { type ParsedUrlQueryInput, stringify } from "querystring";
import { CookieJar, type SerializedCookieJar } from "tough-cookie";

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
import {
  type ApiState,
  type ExportedApiState,
  exportedApiStateSchema,
} from "./state";

export type ApiClientEvents = {
  response: (response: AxiosResponse) => void;
};

export class ApiClient extends EventEmitter<ApiClientEvents> {
  state: ApiState = {
    wwwClaim: null,
    mid: null,
    directRegionalHint: null,
    auth: null,
    passwordEncryption: null,
    device: generateDeviceState(randomUUID()),
  };
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

  #generateTemporaryGuid(seed: string, lifetimeMs: number) {
    return new Chance(
      `${seed}${this.state.device.deviceId}${Math.round(Date.now() / lifetimeMs)}`,
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

  isAuthenticated() {
    return !!this.state.auth;
  }

  extractCookie(key: string) {
    return this.cookieJar.getCookiesSync(API_URL).find((c) => c.key === key);
  }

  extractCookieValue(key: string) {
    const cookie = this.extractCookie(key);
    return cookie?.value ?? null;
  }

  getUserId() {
    return this.state.auth?.userId ?? this.extractCookieValue("ds_user_id");
  }

  getCsrfToken() {
    return this.extractCookieValue("csrftoken");
  }

  getUserAgent() {
    return `Instagram ${APP_VERSION} Android (${this.state.device.deviceString}; ${LANGUAGE}; ${APP_VERSION_CODE})`;
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

  exportState(): ExportedApiState {
    return exportedApiStateSchema.parse({
      ...structuredClone(this.state),
      cookieJar: this.cookieJar.serializeSync(),
    });
  }

  importState(state: ExportedApiState) {
    const parsedState = exportedApiStateSchema.parse(state);
    this.state = parsedState;
    try {
      this.cookieJar = CookieJar.deserializeSync(
        parsedState.cookieJar as SerializedCookieJar,
      );
    } catch {
      this.cookieJar = new CookieJar();
    }
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
      "X-MID": this.state.mid ?? "",
      "X-IG-WWW-Claim": this.state.wwwClaim ?? "",
      "X-Bloks-Is-Layout-RTL": "false",
      "X-IG-Connection-Type": CONNECTION_TYPE_HEADER,
      "X-IG-Capabilities": CAPABILITIES_HEADER,
      "X-IG-App-ID": FB_ANALYTICS_APPLICATION_ID,
      "X-IG-Device-ID": this.state.device.uuid,
      "X-IG-Android-ID": this.state.device.deviceId,
      "Accept-Language": LANGUAGE.replace("_", "-"),
      "X-FB-HTTP-Engine": "Liger",
      Authorization: this.state.auth?.token,
      Host: "i.instagram.com",
      "Accept-Encoding": "gzip",
      Connection: "close",
    };
  }

  #updateAuthState(response: AxiosResponse) {
    const {
      "x-ig-set-www-claim": wwwClaim,
      "ig-set-x-mid": mid,
      "ig-set-ig-u-ig-direct-region-hint": directRegionalHint,
      "ig-set-authorization": authToken,
      "ig-set-password-encryption-key-id": pwKeyId,
      "ig-set-password-encryption-pub-key": pwPubKey,
    } = response.headers;

    if (typeof wwwClaim === "string") {
      this.state.wwwClaim = wwwClaim || null;
    }
    if (typeof mid === "string") {
      this.state.mid = mid || null;
    }
    if (typeof directRegionalHint === "string") {
      this.state.directRegionalHint = directRegionalHint || null;
    }
    if (typeof authToken === "string") {
      if (authToken) {
        try {
          const parsedAuth = parseAuthToken(authToken);
          this.state.auth = {
            token: authToken,
            userId: parsedAuth.ds_user_id,
            sessionId: parsedAuth.sessionid,
            shouldUserHeaderOverCookie:
              parsedAuth.should_user_header_over_cookie,
          };
        } catch {
          throw new Error(`Failed to parse auth token: ${authToken}`);
        }
      } else {
        this.state.auth = null;
      }
    }
    if (typeof pwKeyId === "string" && typeof pwPubKey === "string") {
      if (pwKeyId && pwPubKey) {
        this.state.passwordEncryption = {
          pubKey: pwPubKey,
          keyId: pwKeyId,
        };
      } else {
        this.state.passwordEncryption = null;
      }
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
    this.emit("response", response);

    return response.data;
  }
}

export function generateDeviceState(seed: string) {
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

function parseAuthToken(token: string) {
  return JSON.parse(
    Buffer.from(token.substring("Bearer IGT:2:".length), "base64").toString(),
  ) as {
    ds_user_id: string;
    sessionid: string;
    should_user_header_over_cookie: string;
  };
}
