import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CreateBucketCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadBucketCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SignedReadIntent, SignedUploadIntent, StoragePutInput } from "./types";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>("storage.bucket") ?? "evzone-assets";
    this.signedUrlTtlSeconds =
      config.get<number>("storage.signedUrlTtlSeconds") ?? 900;
    this.client = new S3Client({
      region: config.get<string>("storage.region") ?? "us-east-1",
      endpoint: config.get<string>("storage.endpoint"),
      forcePathStyle: config.get<boolean>("storage.forcePathStyle") ?? true,
      credentials: {
        accessKeyId: config.get<string>("storage.accessKey") ?? "minioadmin",
        secretAccessKey:
          config.get<string>("storage.secretKey") ?? "minioadmin",
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  getBucket(): string {
    return this.bucket;
  }

  buildObjectKey(parts: string[], fileName: string): string {
    const safeParts = parts
      .map((part) => this.cleanPathPart(part))
      .filter((part) => part.length > 0);
    return [...safeParts, this.cleanFileName(fileName)].join("/");
  }

  async createUploadIntent(
    objectKey: string,
    contentType: string,
  ): Promise<SignedUploadIntent> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.signedUrlTtlSeconds,
    });
    return {
      bucket: this.bucket,
      objectKey,
      uploadUrl,
      expiresInSeconds: this.signedUrlTtlSeconds,
    };
  }

  async createReadUrl(objectKey: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: this.signedUrlTtlSeconds,
    });
  }

  async createReadIntent(objectKey: string): Promise<SignedReadIntent> {
    const readUrl = await this.createReadUrl(objectKey);
    return {
      objectKey,
      readUrl,
      expiresInSeconds: this.signedUrlTtlSeconds,
    };
  }

  async putObject(input: StoragePutInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        Body: input.body,
      }),
    );
  }

  async headObject(objectKey: string): Promise<HeadObjectCommandOutput> {
    return this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  async getObject(objectKey: string): Promise<GetObjectCommandOutput> {
    return this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }),
    );
  }

  private async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error: unknown) {
      try {
        await this.client.send(
          new CreateBucketCommand({ Bucket: this.bucket }),
        );
        this.logger.log(`Created object storage bucket ${this.bucket}`);
      } catch (createError: unknown) {
        const message =
          createError instanceof Error
            ? createError.message
            : "Unknown storage error";
        this.logger.warn(
          `Object storage bucket ${this.bucket} is not ready: ${message}`,
        );
      }
      if (error instanceof Error) {
        this.logger.debug(`Initial bucket check failed: ${error.message}`);
      }
    }
  }

  private cleanPathPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, "");
  }

  private cleanFileName(value: string): string {
    const withoutPath = value.split(/[\\/]/).pop() ?? "file";
    return withoutPath.replace(/[^a-zA-Z0-9._-]/g, "_");
  }
}
