export interface DocumentMeta {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
  deletedAt?: string;
}
