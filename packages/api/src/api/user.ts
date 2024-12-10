import { type UserInfoResponseDto } from "@instagramjs/api-types";

import { type ApiClient } from "~/client";

export class UserApi {
  constructor(public client: ApiClient) {}

  async getUser(userId: string) {
    const response = await this.client.makeRequest<UserInfoResponseDto>({
      method: "GET",
      url: `/api/v1/users/${userId}/info/`,
    });
    return response.user;
  }
}
