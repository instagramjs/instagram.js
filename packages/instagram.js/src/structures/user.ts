import { type UserInfoDto } from "@instagramjs/api-types";

import { type Client } from "~/client";

export type UserAsJSON = Pick<User, "id" | "username" | "fullName">;

export class User {
  id = "";
  username = "";
  fullName: string | null = null;

  constructor(
    public client: Client,
    data?: UserInfoDto,
  ) {
    if (data) {
      this.patch(data);
    }
  }

  patch(data: UserInfoDto) {
    if ("pk_id" in data) {
      this.id = data.pk_id;
    }
    if ("username" in data) {
      this.username = data.username;
    }
    if ("full_name" in data) {
      this.fullName = data.full_name || null;
    }
  }

  toJSON(): UserAsJSON {
    return {
      id: this.id,
      username: this.username,
      fullName: this.fullName,
    };
  }
}
