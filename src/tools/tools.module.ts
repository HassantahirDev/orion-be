import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { ToolsController } from './tools.controller';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
  imports: [SessionsModule],
})
export class ToolsModule {}

