import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsService } from './projects.service';
import { ProjectsController, MilestonesController } from './projects.controller';
import { Project } from './entities/project.entity';
import { Milestone } from './entities/milestone.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Milestone])],
  providers: [ProjectsService],
  controllers: [ProjectsController, MilestonesController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
