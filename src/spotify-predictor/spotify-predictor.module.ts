import { Module } from '@nestjs/common';
import { SpotifyPredictorController } from './spotify-predictor.controller';
import { SpotifyPredictorService } from './spotify-predictor.service';

@Module({
  controllers: [SpotifyPredictorController],
  providers: [SpotifyPredictorService],
  exports: [SpotifyPredictorService],
})
export class SpotifyPredictorModule {}

