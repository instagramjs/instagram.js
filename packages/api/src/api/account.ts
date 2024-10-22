import * as crypto from "crypto";

import { type ApiClient } from "~/client";
import { SIGNATURE_VERSION } from "~/constants";

export type AccountLoginResponseDto = {
  logged_in_user: AccountLoggedInUserDto;
  status: string;
};
export type AccountLoggedInUserDto = {
  pk: number;
  username: string;
  full_name: string;
  is_private: boolean;
  profile_pic_url: string;
  profile_pic_id: string;
  is_verified: boolean;
  has_anonymous_profile_picture: boolean;
  can_boost_post: boolean;
  is_business: boolean;
  account_type: number;
  is_call_to_action_enabled: null;
  can_see_organic_insights: boolean;
  show_insights_terms: boolean;
  reel_auto_archive: string;
  has_placed_orders: boolean;
  allowed_commenter_type: string;
  nametag: AccountLoggedInUserNametagDto;
  allow_contacts_sync: boolean;
  phone_number: string;
  country_code: number;
  national_number: number;
};
export type AccountLoggedInUserNametagDto = {
  mode: number;
  gradient: string;
  emoji: string;
  selfie_sticker: string;
};

export class AccountApi {
  constructor(public client: ApiClient) {}

  async login(username: string, password: string) {
    const { countryCode, device } = this.client;
    const encrypted = this.#encryptPassword(password);
    const response = await this.client.makeRequest<AccountLoginResponseDto>({
      method: "POST",
      url: "/api/v1/accounts/login/",
      form: {
        jazoest: createJazoest(device.phoneId),
        country_codes: JSON.stringify([
          { country_code: countryCode, source: ["instagram"] },
        ]),
        phone_id: device.phoneId,
        enc_password: encrypted,
        username,
        adid: device.adId,
        guid: device.uuid,
        device_id: device.deviceId,
        google_tokens: JSON.stringify([]),
        login_attempt_count: 0,
      },
    });

    return response.logged_in_user;
  }

  #encryptPassword(password: string) {
    if (!this.client.state.passwordEncryptionPubKey) {
      throw new Error("Can't login without password encryption public key");
    }
    if (!this.client.state.passwordEncryptionKeyId) {
      throw new Error("Can't login without password encryption key ID");
    }

    const randKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const rsaEncrypted = crypto.publicEncrypt(
      {
        key: Buffer.from(
          this.client.state.passwordEncryptionPubKey,
          "base64",
        ).toString(),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      randKey,
    );
    const cipher = crypto.createCipheriv("aes-256-gcm", randKey, iv);
    const time = Math.floor(Date.now() / 1000).toString();
    cipher.setAAD(Buffer.from(time));
    const aesEncrypted = Buffer.concat([
      cipher.update(password, "utf8"),
      cipher.final(),
    ]);
    const sizeBuffer = Buffer.alloc(2, 0);
    sizeBuffer.writeInt16LE(rsaEncrypted.byteLength, 0);
    const authTag = cipher.getAuthTag();
    const encrypted = Buffer.concat([
      Buffer.from([1, Number(this.client.state.passwordEncryptionKeyId)]),
      iv,
      sizeBuffer,
      rsaEncrypted,
      authTag,
      aesEncrypted,
    ]).toString("base64");
    return `#PWD_INSTAGRAM:${SIGNATURE_VERSION}:${time}:${encrypted}`;
  }
}

function createJazoest(input: string): string {
  const buf = Buffer.from(input, "ascii");
  let sum = 0;
  for (let i = 0; i < buf.byteLength; i++) {
    sum += buf.readUInt8(i);
  }
  return `2${sum}`;
}
