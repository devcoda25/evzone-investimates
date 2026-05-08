import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { InvestorProfile } from './entities/investor-profile.entity';
import { EntrepreneurProfile } from './entities/entrepreneur-profile.entity';
import { AssessorProfile } from './entities/assessor-profile.entity';
import { UserRole, UserStatus, KycStatus } from '@common/enums';
import { PaginatedResponse } from '@common/dto/pagination.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { KycSubmitDto } from './dto/kyc-submit.dto';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { UserFilterDto } from './dto/user-filter.dto';
import { UserStatsDto, RoleCountDto, StatusCountDto, KycStatusCountDto } from './dto/user-stats.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(InvestorProfile)
    private readonly investorProfileRepository: Repository<InvestorProfile>,
    @InjectRepository(EntrepreneurProfile)
    private readonly entrepreneurProfileRepository: Repository<EntrepreneurProfile>,
    @InjectRepository(AssessorProfile)
    private readonly assessorProfileRepository: Repository<AssessorProfile>,
  ) {}

  /**
   * Find all users with optional filtering, pagination, and search.
   */
  async findAll(filter: UserFilterDto): Promise<PaginatedResponse<User>> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const sortBy = filter.sortBy ?? 'createdAt';
    const sortOrder = filter.sortOrder ?? 'DESC';
    const { role, status, kycStatus, country, search } = filter;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    // Apply role filter
    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    // Apply status filter
    if (status) {
      queryBuilder.andWhere('user.status = :status', { status });
    }

    // Apply KYC status filter
    if (kycStatus) {
      queryBuilder.andWhere('user.kycStatus = :kycStatus', { kycStatus });
    }

    // Apply country filter
    if (country) {
      queryBuilder.andWhere('user.country = :country', { country });
    }

    // Apply search term across firstName, lastName, and email
    if (search) {
      const searchTerm = `%${search}%`;
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('user.firstName ILIKE :search', { search: searchTerm })
            .orWhere('user.lastName ILIKE :search', { search: searchTerm })
            .orWhere('user.email ILIKE :search', { search: searchTerm });
        }),
      );
    }

    // Get total count before applying pagination
    const total = await queryBuilder.getCount();

    // Apply sorting, pagination
    queryBuilder
      .orderBy(`user.${sortBy}`, sortOrder)
      .skip(skip)
      .take(limit);

    const data = await queryBuilder.getMany();
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Find a user by their ID, eager-loading the appropriate profile based on role.
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: [
        'investorProfile',
        'entrepreneurProfile',
        'assessorProfile',
      ],
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  /**
   * Find a user by their email address. Used for authentication lookups.
   */
  async findByEmail(email: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: [
        'investorProfile',
        'entrepreneurProfile',
        'assessorProfile',
      ],
    });

    return user;
  }

  /**
   * Create a new user with an associated profile based on their role.
   * Used by admin to create users directly.
   */
  async create(dto: CreateUserDto): Promise<User> {
    // Check if email already exists
    const existing = await this.userRepository.findOne({
      where: { email: dto.email },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create user entity
    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
    });

    const savedUser = await this.userRepository.save(user);

    // Create appropriate profile for the user's role
    await this.createProfileForUser(savedUser, savedUser.role);

    // Return the user with profile relations loaded
    return this.findById(savedUser.id);
  }

  /**
   * Update a user by ID. Syncs profile data when relevant fields change.
   */
  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);

    // Check email uniqueness if being changed
    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepository.findOne({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException('Email already in use');
      }
    }

    // Hash password if being updated
    const updateData: Partial<User> = { ...dto };
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 12);
    }

    await this.userRepository.update(id, updateData);

    // If role changed, ensure a profile exists for the new role
    if (dto.role && dto.role !== user.role) {
      const userWithNewRole = Object.assign(Object.create(Object.getPrototypeOf(user)), user);
      userWithNewRole.role = dto.role;
      await this.createProfileForUser(userWithNewRole, dto.role);
    }

    return this.findById(id);
  }

  /**
   * Soft delete a user by ID.
   */
  async softDelete(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.userRepository.softDelete(id);
  }

  /**
   * Verify or reject a user's KYC submission. Admin only.
   */
  async verifyKyc(id: string, dto: VerifyKycDto): Promise<User> {
    const user = await this.findById(id);

    if (user.kycStatus !== KycStatus.PENDING) {
      throw new BadRequestException('User has no pending KYC submission');
    }

    const updateData: Partial<User> = {
      kycStatus: dto.status,
    };

    if (dto.status === KycStatus.VERIFIED) {
      updateData.kycVerifiedAt = new Date();
    }

    await this.userRepository.update(id, updateData);
    return this.findById(id);
  }

  /**
   * Suspend a user account. Admin only.
   */
  async suspend(id: string, reason?: string): Promise<User> {
    const user = await this.findById(id);

    if (user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('User is already suspended');
    }

    await this.userRepository.update(id, {
      status: UserStatus.SUSPENDED,
    });

    return this.findById(id);
  }

  /**
   * Unsuspend a user account, setting status back to ACTIVE. Admin only.
   */
  async unsuspend(id: string): Promise<User> {
    const user = await this.findById(id);

    if (user.status !== UserStatus.SUSPENDED) {
      throw new BadRequestException('User is not suspended');
    }

    await this.userRepository.update(id, {
      status: UserStatus.ACTIVE,
    });

    return this.findById(id);
  }

  /**
   * Update a user's profile fields (firstName, lastName, phone, bio, country, city, preferences, avatar).
   */
  async updateProfile(id: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findById(id);

    const { firstName, lastName, phone, bio, country, city, preferences, avatar } = dto;

    // Build update object with only provided fields
    const updateData: Partial<User> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (country !== undefined) updateData.country = country;
    if (city !== undefined) updateData.city = city;
    if (preferences !== undefined) updateData.preferences = preferences;
    if (avatar !== undefined) updateData.avatar = avatar;

    await this.userRepository.update(id, updateData);

    return this.findById(id);
  }

  /**
   * Submit KYC documents for verification. Sets kycStatus to PENDING.
   */
  async submitKyc(id: string, dto: KycSubmitDto): Promise<User> {
    const user = await this.findById(id);

    if (user.kycStatus === KycStatus.VERIFIED) {
      throw new BadRequestException('User is already KYC verified');
    }

    // Build the merged preferences object
    const existingPrefs = user.preferences || {};
    const updatedPreferences: Record<string, any> = {
      ...existingPrefs,
      kycDocuments: dto.documents,
      kycIdType: dto.idType,
      kycIdNumber: dto.idNumber,
      kycSubmittedAt: new Date().toISOString(),
    };
    if (dto.notes) {
      updatedPreferences.kycNotes = dto.notes;
    }

    await this.userRepository.update(id, {
      kycStatus: KycStatus.PENDING,
      kycSubmittedAt: new Date(),
      preferences: updatedPreferences,
    });

    return this.findById(id);
  }

  /**
   * Get user statistics: count by role, status, KYC status, and new users this month.
   */
  async getStats(): Promise<UserStatsDto> {
    // Total users
    const totalUsers = await this.userRepository.count();

    // New users this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newUsersThisMonthResult = await this.userRepository
      .createQueryBuilder('user')
      .where('user.createdAt >= :startOfMonth', { startOfMonth })
      .getCount();

    // Count by role
    const roleCounts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.role')
      .getRawMany();

    const byRole: RoleCountDto[] = roleCounts.map((r) => ({
      role: r.role,
      count: parseInt(r.count, 10),
    }));

    // Count by status
    const statusCounts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.status')
      .getRawMany();

    const byStatus: StatusCountDto[] = statusCounts.map((s) => ({
      status: s.status,
      count: parseInt(s.count, 10),
    }));

    // Count by KYC status
    const kycCounts = await this.userRepository
      .createQueryBuilder('user')
      .select('user.kycStatus', 'kycStatus')
      .addSelect('COUNT(*)', 'count')
      .groupBy('user.kycStatus')
      .getRawMany();

    const byKycStatus: KycStatusCountDto[] = kycCounts.map((k) => ({
      kycStatus: k.kycStatus,
      count: parseInt(k.count, 10),
    }));

    return {
      totalUsers,
      newUsersThisMonth: newUsersThisMonthResult,
      byRole,
      byStatus,
      byKycStatus,
    };
  }

  /**
   * Helper: Create an appropriate profile entity for a user based on their role.
   * Skips if a profile already exists.
   */
  async createProfileForUser(user: User, role: UserRole): Promise<void> {
    switch (role) {
      case UserRole.INVESTOR: {
        const existingInvestor = await this.investorProfileRepository.findOne({
          where: { userId: user.id },
        });
        if (!existingInvestor) {
          const profile = this.investorProfileRepository.create({
            userId: user.id,
          });
          await this.investorProfileRepository.save(profile);
        }
        break;
      }
      case UserRole.ENTREPRENEUR: {
        const existingEntrepreneur = await this.entrepreneurProfileRepository.findOne({
          where: { userId: user.id },
        });
        if (!existingEntrepreneur) {
          const profile = this.entrepreneurProfileRepository.create({
            userId: user.id,
            companyName: '',
            industry: '',
          });
          await this.entrepreneurProfileRepository.save(profile);
        }
        break;
      }
      case UserRole.ASSESSOR: {
        const existingAssessor = await this.assessorProfileRepository.findOne({
          where: { userId: user.id },
        });
        if (!existingAssessor) {
          const profile = this.assessorProfileRepository.create({
            userId: user.id,
            organizationName: '',
            yearsOfExperience: 0,
          });
          await this.assessorProfileRepository.save(profile);
        }
        break;
      }
      case UserRole.ADMIN:
      default:
        // Admin users don't need a specialized profile
        break;
    }
  }
}
