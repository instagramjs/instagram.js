import { describe, expect, it } from 'vitest';
import { ClientUser, User } from './user';

describe('User', () => {
  it('constructs with all fields', () => {
    const user = new User({
      id: '123',
      username: 'testuser',
      fullName: 'Test User',
      profilePicUrl: 'https://example.com/pic.jpg',
      isVerified: true,
    });
    expect(user.id).toBe('123');
    expect(user.username).toBe('testuser');
    expect(user.fullName).toBe('Test User');
    expect(user.profilePicUrl).toBe('https://example.com/pic.jpg');
    expect(user.isVerified).toBe(true);
    expect(user.partial).toBe(false);
  });

  it('defaults nullable fields to null', () => {
    const user = new User({ id: '456' });
    expect(user.username).toBeNull();
    expect(user.fullName).toBeNull();
    expect(user.profilePicUrl).toBeNull();
    expect(user.isVerified).toBeNull();
    expect(user.partial).toBe(false);
  });

  it('sets partial flag', () => {
    const user = new User({ id: '789', partial: true });
    expect(user.partial).toBe(true);
  });

  it('makes client non-enumerable', () => {
    const fakeClient = { test: true };
    const user = new User({ id: '1', client: fakeClient });
    expect(user.client).toBe(fakeClient);
    expect(Object.keys(user)).not.toContain('client');
  });
});

describe('User.from', () => {
  it('creates from raw API data', () => {
    const user = User.from({
      pk: 12345,
      username: 'rawuser',
      full_name: 'Raw User',
      profile_pic_url: 'https://example.com/raw.jpg',
      is_verified: false,
    });
    expect(user.id).toBe('12345');
    expect(user.username).toBe('rawuser');
    expect(user.fullName).toBe('Raw User');
    expect(user.profilePicUrl).toBe('https://example.com/raw.jpg');
    expect(user.isVerified).toBe(false);
    expect(user.partial).toBe(false);
  });

  it('prefers pk_id over pk', () => {
    const user = User.from({
      pk: 111,
      pk_id: '222',
      username: 'test',
    });
    expect(user.id).toBe('222');
  });

  it('creates partial user when username is missing', () => {
    const user = User.from({ pk: 999 });
    expect(user.id).toBe('999');
    expect(user.partial).toBe(true);
    expect(user.username).toBeNull();
  });
});

describe('User.backfill', () => {
  it('fills in missing fields and flips partial to false', () => {
    const user = new User({ id: '1', partial: true });
    user.backfill({
      username: 'filled',
      fullName: 'Filled User',
      profilePicUrl: 'https://example.com/filled.jpg',
      isVerified: true,
    });
    expect(user.username).toBe('filled');
    expect(user.fullName).toBe('Filled User');
    expect(user.profilePicUrl).toBe('https://example.com/filled.jpg');
    expect(user.isVerified).toBe(true);
    expect(user.partial).toBe(false);
  });

  it('only updates provided fields', () => {
    const user = new User({
      id: '2',
      username: 'original',
      fullName: 'Original',
      partial: true,
    });
    user.backfill({ fullName: 'Updated' });
    expect(user.username).toBe('original');
    expect(user.fullName).toBe('Updated');
    expect(user.partial).toBe(false);
  });

  it('stays partial if username remains null', () => {
    const user = new User({ id: '3', partial: true });
    user.backfill({ fullName: 'Some Name' });
    expect(user.partial).toBe(true);
  });
});

describe('ClientUser', () => {
  it('extends User with igScopedId', () => {
    const cu = new ClientUser({
      id: '100',
      username: 'me',
      igScopedId: '17841400000000',
    });
    expect(cu).toBeInstanceOf(User);
    expect(cu.id).toBe('100');
    expect(cu.username).toBe('me');
    expect(cu.igScopedId).toBe('17841400000000');
  });
});
