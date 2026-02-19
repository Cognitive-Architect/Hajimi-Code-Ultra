declare module '@hajimi/diff' {
  export function blake3_256(input: Buffer): Uint8Array;
  export function xxh64(input: Buffer): bigint;
  export const version: string;
}
