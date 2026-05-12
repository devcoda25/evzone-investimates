import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@evzone/database";
import { Prisma } from "@prisma/client";
import * as crypto from "crypto";

export interface MfaSetupResult {
  secret: string;
  qrCodeUri: string;
  backupCodes: string[];
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly issuer: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.issuer = this.config.get<string>("jwt.issuer") ?? "evzone-api";
  }

  /**
   * Generates a TOTP secret and backup codes for a user.
   * The secret should be shown to the user once (e.g. as a QR code).
   * Backup codes are hashed before storage.
   */
  async setup(userId: string, email: string): Promise<MfaSetupResult> {
    const secret = this.generateSecret();
    const backupCodes = this.generateBackupCodes(10);
    const hashedBackupCodes = backupCodes.map((code) => this.hashCode(code));

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const existingPrefs = (user?.preferences as Record<string, unknown> | null) ?? {};

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false, // Enabled only after verification
        preferences: {
          ...existingPrefs,
          mfaSecret: this.encryptSecret(secret),
          mfaBackupCodes: hashedBackupCodes,
          mfaSetupAt: new Date().toISOString(),
        },
      },
    });

    const qrCodeUri = this.buildOtpauthUri(email, secret);
    return { secret, qrCodeUri, backupCodes };
  }

  /**
   * Verifies a TOTP token during setup to enable MFA.
   */
  async verifySetup(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    if (!user?.preferences) return false;

    const prefs = user.preferences as Record<string, unknown>;
    const encryptedSecret = prefs.mfaSecret as string | undefined;
    if (!encryptedSecret) return false;

    const secret = this.decryptSecret(encryptedSecret);

    if (this.verifyTotp(secret, token, 1)) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
      return true;
    }
    return false;
  }

  /**
   * Validates a TOTP token or backup code at login time.
   */
  async validate(userId: string, token: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true, mfaEnabled: true },
    });
    if (!user?.mfaEnabled) return true; // MFA not enabled
    if (!user.preferences) return false;

    const prefs = user.preferences as Record<string, unknown>;
    const encryptedSecret = prefs.mfaSecret as string | undefined;

    if (encryptedSecret) {
      const secret = this.decryptSecret(encryptedSecret);
      if (this.verifyTotp(secret, token, 1)) {
        return true;
      }
    }

    // Check backup codes atomically
    const codeHash = this.hashCode(token);
    const consumed = await this.prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: { preferences: true },
      });
      if (!currentUser?.preferences) return false;
      const currentPrefs = currentUser.preferences as Record<string, unknown>;
      const currentCodes = (currentPrefs.mfaBackupCodes as string[]) ?? [];
      const matchIndex = currentCodes.findIndex((hc) => hc === codeHash);
      if (matchIndex < 0) return false;
      const updatedCodes = currentCodes.filter((_, i) => i !== matchIndex);
      await tx.user.update({
        where: { id: userId },
        data: {
          preferences: {
            ...currentPrefs,
            mfaBackupCodes: updatedCodes,
          },
        },
      });
      return true;
    });
    if (consumed) return true;

    return false;
  }

  async disable(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const existingPrefs = (user?.preferences as Record<string, unknown> | null) ?? {};
    const { mfaSecret: _mfaSecret, mfaBackupCodes: _mfaBackupCodes, mfaSetupAt: _mfaSetupAt, ...rest } = existingPrefs;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        preferences: rest as Prisma.InputJsonValue,
      },
    });
  }

  private generateSecret(): string {
    return this.base32Encode(crypto.randomBytes(20));
  }

  private base32Encode(buffer: Buffer): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let output = "";
    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    return output;
  }

  private base32Decode(encoded: string): Buffer {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const map = new Map<string, number>();
    for (let i = 0; i < alphabet.length; i++) {
      map.set(alphabet[i], i);
    }
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const char of encoded.toUpperCase()) {
      const val = map.get(char);
      if (val === undefined) continue;
      value = (value << 5) | val;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(16).toString("hex").toUpperCase());
    }
    return codes;
  }

  private hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  private getEncryptionKey(): string {
    const key = this.config.get<string>("MFA_ENCRYPTION_KEY");
    if (!key || key.trim().length === 0) {
      throw new Error("MFA_ENCRYPTION_KEY is not configured");
    }
    return key;
  }

  private encryptSecret(secret: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      crypto.scryptSync(key, "salt", 32),
      iv,
    );
    const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  private decryptSecret(encrypted: string): string {
    const key = this.getEncryptionKey();
    const [ivHex, authTagHex, encryptedHex] = encrypted.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      crypto.scryptSync(key, "salt", 32),
      iv,
    );
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  }

  private generateTotp(secret: string, stepOffset = 0): string {
    const period = 30;
    const time = Math.floor(Date.now() / 1000 / period) + stepOffset;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(time), 0);

    const key = this.base32Decode(secret);
    const hmac = crypto.createHmac("sha1", key).update(timeBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24 |
        (hmac[offset + 1] & 0xff) << 16 |
        (hmac[offset + 2] & 0xff) << 8 |
        (hmac[offset + 3] & 0xff)) %
      1_000_000;
    return code.toString().padStart(6, "0");
  }

  private verifyTotp(secret: string, token: string, window = 1): boolean {
    for (let offset = -window; offset <= window; offset++) {
      const expectedToken = this.generateTotp(secret, offset);
      if (token === expectedToken) {
        return true;
      }
    }
    return false;
  }

  private buildOtpauthUri(email: string, secret: string): string {
    const label = encodeURIComponent(`${this.issuer}:${email}`);
    const issuerParam = encodeURIComponent(this.issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuerParam}`;
  }
}
