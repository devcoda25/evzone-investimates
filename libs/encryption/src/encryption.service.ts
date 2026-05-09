import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class EncryptionService {
  private readonly algorithm = "aes-256-gcm";
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const encryptionKey = config.get<string>("ENCRYPTION_KEY");
    if (!encryptionKey) {
      throw new Error("ENCRYPTION_KEY environment variable is required");
    }
    // Derive a 32-byte key using scrypt
    this.key = scryptSync(encryptionKey, "evzone-salt", 32);
  }

  /**
   * Encrypt a plaintext string.
   * Returns a base64-encoded string containing: iv + authTag + encrypted data.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString("base64");
  }

  /**
   * Decrypt an encrypted string (base64-encoded).
   */
  decrypt(ciphertext: string): string {
    const combined = Buffer.from(ciphertext, "base64");
    const iv = combined.subarray(0, 16);
    const authTag = combined.subarray(16, 32);
    const encrypted = combined.subarray(32);

    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }

  /**
   * Hash a value using SHA-256 (for field-level hashing without need for decryption).
   */
  hash(value: string): string {
    const { createHash } = require("crypto");
    return createHash("sha256").update(value).digest("hex");
  }
}