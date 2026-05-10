declare module "sharp" {
  function sharp(input?: Buffer | ArrayBuffer | Uint8Array | string): {
    resize(width: number, height: number, options?: { fit?: string }): ReturnType<typeof sharp>;
    toFormat(format: string): ReturnType<typeof sharp>;
    toBuffer(): Promise<Buffer>;
  };
  export default sharp;
}
