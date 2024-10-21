export type MaybePromise<T> = T | Promise<T>;

export type Json = {
  [key: string | number]:
    | string
    | number
    | boolean
    | null
    | Json
    | JsonArray
    | undefined;
};
export type JsonArray = Array<
  string | number | boolean | Date | Json | JsonArray
>;
