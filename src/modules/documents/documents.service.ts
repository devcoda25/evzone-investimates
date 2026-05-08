import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
  import { InjectRepository } from '@nestjs/typeorm';
  import { Repository } from 'typeorm';
  import { existsSync, promises as fs } from 'fs';
  import { join } from 'path';
  import { v4 as uuidv4 } from 'uuid';

  import { Document } from './entities/document.entity';

  const UPLOAD_DIR = join(process.cwd(), 'uploads', 'documents');

  @Injectable()
  export class DocumentsService {
    constructor(
      @InjectRepository(Document)
      private readonly documentRepository: Repository<Document>,
    ) {
      this.ensureUploadDir();
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
    ): Promise<Document> {
      if (!file) {
        throw new BadRequestException('No file provided');
      }

      await this.ensureUploadDir();

      const id = uuidv4();
      const ext = file.originalname.split('.').pop() || 'bin';
      const fileName = `${id}.${ext}`;
      const filePath = join(UPLOAD_DIR, fileName);

      await fs.writeFile(filePath, file.buffer);

      const doc = this.documentRepository.create({
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
      });

      return this.documentRepository.save(doc);
    }

    async findByUser(userId: string): Promise<Document[]> {
      return this.documentRepository.find({
        where: { uploadedBy: userId },
        order: { createdAt: 'DESC' },
      });
    }

    async findById(id: string): Promise<Document> {
      const doc = await this.documentRepository.findOne({ where: { id } });
      if (!doc) {
        throw new NotFoundException(`Document with ID "${id}" not found`);
      }
      return doc;
    }

    async softDelete(id: string): Promise<void> {
      const result = await this.documentRepository.softDelete(id);
      if (result.affected === 0) {
        throw new NotFoundException(`Document with ID "${id}" not found`);
      }
    }
  }
