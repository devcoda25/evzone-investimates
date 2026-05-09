import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MediaStatus } from "@prisma/client";
import {
  AuthenticatedUser,
  CurrentUser,
  Public,
} from "@evzone/common";
import {
  CreateProjectDocumentDto,
  CreateUploadIntentDto,
  MediaUploadIntentResponse,
  ProjectDocumentResponse,
  ProjectsModule,
  ProjectsService,
  ReorderGalleryDto,
  UpdateMediaDto,
} from "./projects.module";

@ApiTags("Media")
@ApiBearerAuth()
@Controller("projects")
class MediaController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get(":id/documents")
  findDocuments(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectDocumentResponse[]> {
    return this.projectsService.findDocuments(id, user);
  }

  @Post(":id/documents")
  createDocument(
    @Param("id") id: string,
    @Body() dto: CreateProjectDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    documentId: string;
    bucket: string;
    objectKey: string;
    uploadUrl: string;
    expiresInSeconds: number;
    status: MediaStatus;
  }> {
    return this.projectsService.createDocument(id, dto, user);
  }

  @Post(":id/gallery/upload-intents")
  createGalleryUploadIntent(
    @Param("id") id: string,
    @Body() dto: CreateUploadIntentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MediaUploadIntentResponse> {
    return this.projectsService.createGalleryUploadIntent(id, dto, user);
  }

  @Public()
  @Get(":id/gallery")
  findGallery(@Param("id") id: string): Promise<unknown[]> {
    return this.projectsService.findGallery(id);
  }

  @Patch(":projectId/gallery/:mediaId")
  updateMedia(
    @Param("projectId") projectId: string,
    @Param("mediaId") mediaId: string,
    @Body() dto: UpdateMediaDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.projectsService.updateMedia(projectId, mediaId, dto, user);
  }

  @Delete(":projectId/gallery/:mediaId")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMedia(
    @Param("projectId") projectId: string,
    @Param("mediaId") mediaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.projectsService.deleteMedia(projectId, mediaId, user);
  }

  @Post(":id/gallery/reorder")
  reorderGallery(
    @Param("id") id: string,
    @Body() dto: ReorderGalleryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown[]> {
    return this.projectsService.reorderGallery(id, dto, user);
  }
}

@Module({
  imports: [ProjectsModule],
  controllers: [MediaController],
})
export class MediaModule {}
