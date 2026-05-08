import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

import { DocumentMeta } from './interfaces/document.interface';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'documents');
const META_FILE = join(UPLOAD_DIR, '.metadata.json');

@Injectable()
export class DocumentsService {
  constructor() {
    this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    if (!existsSync(UPLOAD_DIR)) {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
    }
  }

  private async readMeta(): Promise<DocumentMeta[]> {
    try {
      if (!existsSync(META_FILE)) return [];
      const raw = await fs.readFile(META_FILE, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private async writeMeta(docs: DocumentMeta[]): Promise<void> {
    await fs.writeFile(META_FILE, JSON.stringify(docs, null, 2));
  }

  async upload(
    file: Express.Multer.File,
    userId: string,
  ): Promise<DocumentMeta> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    await this.ensureUploadDir();

    const id = uuidv4();
    const ext = file.originalname.split('.').pop() || 'bin';
    const fileName = `${id}.${ext}`;
    const filePath = join(UPLOAD_DIR, fileName);

    await fs.writeFile(filePath, file.buffer);

    const doc: DocumentMeta = {
      id,
      originalName: file.originalname,
      fileName,
      mimeType: file.mimetype,
      size: file.size,
      path: filePath,
      url: `/uploads/documents/${fileName}`,
      uploadedBy: userId,
      createdAt: new Date().toISOString(),
    };

    const meta = await this.readMeta();
    meta.push(doc);
    await this.writeMeta(meta);

    return doc;
  }

  async findById(id: string): Promise<DocumentMeta> {
    const meta = await this.readMeta();
    const doc = meta.find((d) => d.id === id && !d.deletedAt);
    if (!doc) throw new NotFoundException(`Document with ID "${id}" not found`);
    return doc;
  }

  async softDelete(id: string): Promise<void> {
    const meta = await this.readMeta();
    const doc = meta.find((d) => d.id === id && !d.deletedAt);
    if (!doc) throw new NotFoundException(`Document with ID "${id}" not found`);
    doc.deletedAt = new Date().toISOString();
    await this.writeMeta(meta);
  }
}
