import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { normalizePrisma } from '@database/prisma.helpers';
import { existsSync, promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'documents');

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {
    void this.ensureUploadDir();
  }

  private async ensureUploadDir(): Promise<void> {
    if (!existsSync(UPLOAD_DIR)) {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
    }
  }

  async upload(
    file: Express.Multer.File,
    userId: string,
    projectId?: string,
    category?: string,
  ): Promise<any> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    await this.ensureUploadDir();

    const id = uuidv4();
    const ext = file.originalname.split('.').pop() || 'bin';
    const fileName = `${id}.${ext}`;
    const filePath = join(UPLOAD_DIR, fileName);

    await fs.writeFile(filePath, file.buffer);

    const document = await this.prisma.document.create({
      data: {
        id,
        originalName: file.originalname,
        fileName,
        mimeType: file.mimetype,
        size: file.size,
        path: filePath,
        url: `/uploads/documents/${fileName}`,
        uploadedBy: userId,
        projectId,
        category,
      },
    });

    return normalizePrisma(document);
  }

  async findByUser(userId: string): Promise<any[]> {
    const documents = await this.prisma.document.findMany({
      where: { uploadedBy: userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return documents.map((document) => normalizePrisma(document));
  }

  async findById(userId: string, id: string): Promise<any> {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException(`Document with ID "${id}" not found`);
    }
    if (document.uploadedBy !== userId) {
      throw new ForbiddenException('You can only access your own documents');
    }
    return normalizePrisma(document);
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException(`Document with ID "${id}" not found`);
    }
    if (document.uploadedBy !== userId) {
      throw new ForbiddenException('You can only delete your own documents');
    }

    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
