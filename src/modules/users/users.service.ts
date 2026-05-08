import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@database/prisma.service';
import { buildPaginationMeta, getSortField, getSortOrder } from '@database/prisma.helpers';
import { UserRole, UserStatus, KycStatus } from '@common/enums';
import { PaginatedResponse } from '@common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { KycSubmitDto } from './dto/kyc-submit.dto';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { UserStatsDto, RoleCountDto, StatusCountDto, KycStatusCountDto } from './dto/user-stats.dto';
import { createRoleProfile, normalizeUser, userProfileInclude } from './user.prisma';

const USER_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'email',
  'firstName',
  'lastName',
  'lastLoginAt',
  'country',
] as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filter: UserFilterDto): Promise<PaginatedResponse<any>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = getSortField(filter.sortBy, USER_SORT_FIELDS, 'createdAt');
    const sortOrder = getSortOrder(filter.sortOrder);
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: filter.role,
      status: filter.status,
      kycStatus: filter.kycStatus,
      country: filter.country,
    };

    if (filter.search) {
      where.OR = [
        { firstName: { contains: filter.search, mode: 'insensitive' } },
        { lastName: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: userProfileInclude,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map((user) => normalizeUser(user)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findById(id: string): Promise<any> {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userProfileInclude,
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return normalizeUser(user);
  }

  async findByEmail(email: string): Promise<any | null> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: userProfileInclude,
    });

    return user ? normalizeUser(user) : null;
  }

  async create(dto: CreateUserDto): Promise<any> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const password = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
        status: dto.status,
        country: dto.country,
        city: dto.city,
        bio: dto.bio,
        avatar: dto.avatar,
      },
    });

    await createRoleProfile(this.prisma, user.id, user.role as any);

    return this.findById(user.id);
  }

  async update(id: string, dto: UpdateUserDto): Promise<any> {
    const user = await this.findById(id);

    if (dto.email && dto.email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await this.prisma.user.findFirst({
        where: {
          email: dto.email.toLowerCase(),
          NOT: { id },
        },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      email: dto.email?.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      role: dto.role as any,
      status: dto.status as any,
      country: dto.country,
      city: dto.city,
      bio: dto.bio,
      avatar: dto.avatar,
    };

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 12);
    }

    await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    if (dto.role && dto.role !== user.role) {
      await createRoleProfile(this.prisma, id, dto.role as any);
    }

    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async verifyKyc(id: string, dto: VerifyKycDto): Promise<any> {
    const user = await this.findById(id);

    if (user.kycStatus !== KycStatus.PENDING) {
      throw new BadRequestException('User has no pending KYC submission');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        kycStatus: dto.status as any,
        kycVerifiedAt: dto.status === KycStatus.VERIFIED ? new Date() : null,
      },
    });

    return this.findById(id);
  }

  async suspend(id: string, reason?: string): Promise<any> {
    const user = await this.findById(id);

    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('User is already suspended');
    }

    const preferences = { ...(user.preferences || {}) } as Record<string, unknown>;
    if (reason) {
      preferences.suspensionReason = reason;
      preferences.suspendedAt = new Date().toISOString();
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.SUSPENDED as any,
        preferences,
      },
    });

    return this.findById(id);
  }

  async unsuspend(id: string): Promise<any> {
    const user = await this.findById(id);

    if (user.status !== UserStatus.SUSPENDED) {
      throw new BadRequestException('User is not suspended');
    }

    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.ACTIVE as any },
    });

    return this.findById(id);
  }

  async updateProfile(id: string, dto: UpdateProfileDto): Promise<any> {
    await this.findById(id);

    await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        bio: dto.bio,
        country: dto.country,
        city: dto.city,
        avatar: dto.avatar,
        preferences: dto.preferences as Prisma.InputJsonValue | undefined,
      },
    });

    return this.findById(id);
  }

  async submitKyc(id: string, dto: KycSubmitDto): Promise<any> {
    const user = await this.findById(id);

    if (user.kycStatus === KycStatus.VERIFIED) {
      throw new BadRequestException('User is already KYC verified');
    }

    const preferences = {
      ...(user.preferences || {}),
      kycDocuments: dto.documents,
      kycIdType: dto.idType,
      kycIdNumber: dto.idNumber,
      kycSubmittedAt: new Date().toISOString(),
      ...(dto.notes ? { kycNotes: dto.notes } : {}),
    } as Prisma.InputJsonValue;

    await this.prisma.user.update({
      where: { id },
      data: {
        kycStatus: KycStatus.PENDING as any,
        kycSubmittedAt: new Date(),
        preferences,
      },
    });

    return this.findById(id);
  }

  async getStats(): Promise<UserStatsDto> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        role: true,
        status: true,
        kycStatus: true,
        createdAt: true,
      },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const roleMap = new Map<string, number>();
    const statusMap = new Map<string, number>();
    const kycMap = new Map<string, number>();
    let newUsersThisMonth = 0;

    for (const user of users) {
      roleMap.set(user.role, (roleMap.get(user.role) || 0) + 1);
      statusMap.set(user.status, (statusMap.get(user.status) || 0) + 1);
      kycMap.set(user.kycStatus, (kycMap.get(user.kycStatus) || 0) + 1);

      if (user.createdAt >= startOfMonth) {
        newUsersThisMonth += 1;
      }
    }

    const byRole: RoleCountDto[] = Array.from(roleMap.entries()).map(([role, count]) => ({
      role,
      count,
    }));
    const byStatus: StatusCountDto[] = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));
    const byKycStatus: KycStatusCountDto[] = Array.from(kycMap.entries()).map(
      ([kycStatus, count]) => ({
        kycStatus,
        count,
      }),
    );

    return {
      totalUsers: users.length,
      newUsersThisMonth,
      byRole,
      byStatus,
      byKycStatus,
    };
  }

  async createProfileForUser(user: { id: string; role: UserRole }, role: UserRole): Promise<void> {
    await createRoleProfile(this.prisma, user.id, role as any);
  }
}
