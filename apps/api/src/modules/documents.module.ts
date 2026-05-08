import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { randomUUID } from "crypto";
import { memoryStorage } from "multer";
import { DocumentPurpose, MediaStatus } from "@prisma/client";
import { AuthenticatedUser, CurrentUser } from "@evzone/common";
import { PrismaService } from "@evzone/database";
import { PermissionsService } from "@evzone/permissions";
import { SignedUploadIntent, StorageService } from "@evzone/storage";

interface DocumentResponse {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number | null;
  path: string;
  url: string | null;
  uploadedBy: string;
  purpose: DocumentPurpose;
  status: MediaStatus;
  createdAt: Date;
  deletedAt: Date | null;
}

class CreateDocumentUploadIntentDto {
  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sizeBytes?: number;

  @IsOptional()
  @IsEnum(DocumentPurpose)
  purpose?: DocumentPurpose;

  @IsOptional()
  @IsString()
  projectId?: string;
}

interface DocumentUploadIntentResponse extends SignedUploadIntent {
  documentId: string;
  status: MediaStatus;
}

@Injectable()
class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly permissions: PermissionsService,
  ) {}

  async createUploadIntent(
    dto: CreateDocumentUploadIntentDto,
    user: AuthenticatedUser,
  ): Promise<DocumentUploadIntentResponse> {
    const documentId = cryptoRandomId();
    const objectKey = this.storage.buildObjectKey(
      ["tenants", user.tenantId, "documents", documentId],
      dto.fileName,
    );
    const intent = await this.storage.createUploadIntent(
      objectKey,
      dto.contentType,
    );
    await this.prisma.document.create({
      data: {
        id: documentId,
        tenantId: user.tenantId,
        ownerUserId: user.id,
        projectId: dto.projectId,
        originalName: dto.fileName,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        bucket: intent.bucket,
        objectKey: intent.objectKey,
        purpose: dto.purpose ?? DocumentPurpose.GENERAL,
        status: MediaStatus.PENDING_UPLOAD,
      },
    });
    return { ...intent, documentId, status: MediaStatus.PENDING_UPLOAD };
  }

  async upload(
    file: Express.Multer.File | undefined,
    user: AuthenticatedUser,
  ): Promise<DocumentResponse> {
    if (!file) throw new BadRequestException("No file provided");
    const documentId = cryptoRandomId();
    const objectKey = this.storage.buildObjectKey(
      ["tenants", user.tenantId, "documents", documentId],
      file.originalname,
    );
    await this.storage.putObject({
      objectKey,
      contentType: file.mimetype,
      body: file.buffer,
    });
    const document = await this.prisma.document.create({
      data: {
        id: documentId,
        tenantId: user.tenantId,
        ownerUserId: user.id,
        originalName: file.originalname,
        contentType: file.mimetype,
        sizeBytes: file.size,
        bucket: this.storage.getBucket(),
        objectKey,
        purpose: DocumentPurpose.GENERAL,
        status: MediaStatus.READY,
      },
    });
    return this.toResponse(document);
  }

  async findByUser(user: AuthenticatedUser): Promise<DocumentResponse[]> {
    const documents = await this.prisma.document.findMany({
      where: { ownerUserId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return documents.map((document) => this.toResponse(document));
  }

  async findByProject(
    projectId: string,
    _user: AuthenticatedUser,
  ): Promise<DocumentResponse[]> {
    const documents = await this.prisma.document.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return documents.map((document) => this.toResponse(document));
  }

  async findById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<DocumentResponse> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.deletedAt)
      throw new NotFoundException("Document not found");
    this.permissions.assertOwnerOrAdmin(user, document.ownerUserId);
    return this.toResponse(document);
  }

  async createReadUrl(
    id: string,
    user: AuthenticatedUser,
  ): Promise<{ url: string }> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.deletedAt)
      throw new NotFoundException("Document not found");
    this.permissions.assertOwnerOrAdmin(user, document.ownerUserId);
    return { url: await this.storage.createReadUrl(document.objectKey) };
  }

  async softDelete(id: string, user: AuthenticatedUser): Promise<void> {
    const document = await this.prisma.document.findUnique({ where: { id } });
    if (!document || document.deletedAt)
      throw new NotFoundException("Document not found");
    this.permissions.assertOwnerOrAdmin(user, document.ownerUserId);
    await this.prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), status: MediaStatus.DELETED },
    });
  }

  private toResponse(document: {
    id: string;
    originalName: string;
    contentType: string;
    sizeBytes: number | null;
    objectKey: string;
    ownerUserId: string;
    purpose: DocumentPurpose;
    status: MediaStatus;
    createdAt: Date;
    deletedAt: Date | null;
  }): DocumentResponse {
    return {
      id: document.id,
      originalName: document.originalName,
      fileName: document.objectKey.split("/").pop() ?? document.id,
      mimeType: document.contentType,
      size: document.sizeBytes,
      path: document.objectKey,
      url: null,
      uploadedBy: document.ownerUserId,
      purpose: document.purpose,
      status: document.status,
      createdAt: document.createdAt,
      deletedAt: document.deletedAt,
    };
  }
}

function cryptoRandomId(): string {
  return randomUUID();
}

@ApiTags("Documents")
@ApiBearerAuth()
@Controller("documents")
class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  findByUser(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponse[]> {
    return this.documentsService.findByUser(user);
  }

  @Get("project/:projectId")
  findByProject(
    @Param("projectId") projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponse[]> {
    return this.documentsService.findByProject(projectId, user);
  }

  @Post("upload-intents")
  createUploadIntent(
    @Body() dto: CreateDocumentUploadIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentUploadIntentResponse> {
    return this.documentsService.createUploadIntent(dto, user);
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  @ApiConsumes("multipart/form-data")
  @ApiOperation({
    summary: "Compatibility multipart upload backed by object storage",
  })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponse> {
    return this.documentsService.upload(file, user);
  }

  @Get(":id")
  findById(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DocumentResponse> {
    return this.documentsService.findById(id, user);
  }

  @Get(":id/download-url")
  createReadUrl(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ url: string }> {
    return this.documentsService.createReadUrl(id, user);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  softDelete(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.documentsService.softDelete(id, user);
  }
}

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
