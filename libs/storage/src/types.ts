export interface SignedUploadIntent {
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface SignedReadIntent {
  objectKey: string;
  readUrl: string;
  expiresInSeconds: number;
}

export interface StoragePutInput {
  objectKey: string;
  contentType: string;
  body: Uint8Array;
}
