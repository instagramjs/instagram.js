export type ClientState = {
  wwwClaim: string | null;
  mid: string | null;
  directRegionHint: string | null;
  shbid: string | null;
  shbts: string | null;
  rur: string | null;
  userId: string | null;
  authorization: string | null;
};

export function createClientState(overrides?: Partial<ClientState>) {
  return {
    wwwClaim: null,
    mid: null,
    directRegionHint: null,
    shbid: null,
    shbts: null,
    rur: null,
    userId: null,
    authorization: null,
    ...overrides,
  };
}
