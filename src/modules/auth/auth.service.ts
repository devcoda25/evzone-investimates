import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@modules/users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async getMe(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['investorProfile', 'entrepreneurProfile', 'assessorProfile'],
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'avatar',
        'phone',
        'role',
        'status',
        'kycStatus',
        'country',
        'city',
        'bio',
        'preferences',
        'lastLoginAt',
        'createdAt',
        'updatedAt',
        'oidcSub',
        'oidcIssuer',
      ],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async logout(userId: string): Promise<void> {
    this.logger.log(`User logged out: ${userId}`);
  }
}
