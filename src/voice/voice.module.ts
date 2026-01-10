import { Module } from '@nestjs/common';
import { VoiceService } from './voice.service';
import { VoiceController } from './voice.controller';
import { MemoryModule } from '../memory/memory.module';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [MemoryModule, SessionsModule],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}

