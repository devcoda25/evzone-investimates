import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}