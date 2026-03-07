import type { RawUser } from '../types';

export class User {
  id: string;
  username: string | null;
  fullName: string | null;
  profilePicUrl: string | null;
  isVerified: boolean | null;
  partial: boolean;
  declare readonly client: unknown;

  constructor(data: {
    id: string;
    username?: string | null;
    fullName?: string | null;
    profilePicUrl?: string | null;
    isVerified?: boolean | null;
    partial?: boolean;
    client?: unknown;
  }) {
    this.id = data.id;
    this.username = data.username ?? null;
    this.fullName = data.fullName ?? null;
    this.profilePicUrl = data.profilePicUrl ?? null;
    this.isVerified = data.isVerified ?? null;
    this.partial = data.partial ?? false;

    if (data.client !== undefined) {
      Object.defineProperty(this, 'client', {
        value: data.client,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
  }

  /** Create a User from raw API data. */
  static from(data: RawUser, client?: unknown): User {
    return new User({
      id: String(data.pk_id ?? data.pk),
      username: data.username ?? null,
      fullName: data.full_name ?? null,
      profilePicUrl: data.profile_pic_url ?? null,
      isVerified: data.is_verified ?? null,
      partial: !data.username,
      client,
    });
  }

  /** Fill in missing fields on a partial user. */
  backfill(data: {
    username?: string | null;
    fullName?: string | null;
    profilePicUrl?: string | null;
    isVerified?: boolean | null;
  }): void {
    if (data.username !== undefined) {
      this.username = data.username;
    }
    if (data.fullName !== undefined) {
      this.fullName = data.fullName;
    }
    if (data.profilePicUrl !== undefined) {
      this.profilePicUrl = data.profilePicUrl;
    }
    if (data.isVerified !== undefined) {
      this.isVerified = data.isVerified;
    }
    if (this.username !== null) {
      this.partial = false;
    }
  }
}

export class ClientUser extends User {
  igScopedId: string;

  constructor(data: {
    id: string;
    username?: string | null;
    fullName?: string | null;
    profilePicUrl?: string | null;
    isVerified?: boolean | null;
    igScopedId: string;
    client?: unknown;
  }) {
    super(data);
    this.igScopedId = data.igScopedId;
  }
}
