import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "@evzone/database";
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

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false, // Enabled only after verification
        preferences: {
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
    const expectedToken = this.generateTotp(secret);

    if (token === expectedToken) {
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
    const hashedBackupCodes = (prefs.mfaBackupCodes as string[]) ?? [];

    if (encryptedSecret) {
      const secret = this.decryptSecret(encryptedSecret);
      if (token === this.generateTotp(secret)) {
        return true;
      }
    }

    // Check backup codes
    const codeHash = this.hashCode(token);
    const matchIndex = hashedBackupCodes.findIndex((hc) => hc === codeHash);
    if (matchIndex >= 0) {
      // Remove used backup code
      hashedBackupCodes.splice(matchIndex, 1);
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          preferences: {
            ...prefs,
            mfaBackupCodes: hashedBackupCodes,
          },
        },
      });
      return true;
    }

    return false;
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        preferences: {
          mfaSecret: null,
          mfaBackupCodes: null,
          mfaSetupAt: null,
        },
      },
    });
  }

  private generateSecret(): string {
    return crypto.randomBytes(20).toString("hex");
  }

  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
    }
    return codes;
  }

  private hashCode(code: string): string {
    return crypto.createHash("sha256").update(code).digest("hex");
  }

  private encryptSecret(secret: string): string {
    // In production, use a real encryption key from env
    const key = this.config.get<string>("JWT_ACCESS_SECRET") ?? "default-key";
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
    const key = this.config.get<string>("JWT_ACCESS_SECRET") ?? "default-key";
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

  private generateTotp(secret: string): string {
    const period = 30;
    const time = Math.floor(Date.now() / 1000 / period);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(time), 0);

    const key = Buffer.from(secret, "hex");
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

  private buildOtpauthUri(email: string, secret: string): string {
    const label = encodeURIComponent(`${this.issuer}:${email}`);
    const issuerParam = encodeURIComponent(this.issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${issuerParam}`;
  }
}
