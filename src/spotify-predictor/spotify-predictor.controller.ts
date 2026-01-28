import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SpotifyPredictorService } from './spotify-predictor.service';
import { PredictTrackDto } from './dto/predict-track.dto';
import { PredictionResponseDto } from './dto/prediction-response.dto';

@Controller('spotify-predictor')
export class SpotifyPredictorController {
  constructor(
    private readonly spotifyPredictorService: SpotifyPredictorService,
  ) {}

  @Post('predict')
  @HttpCode(HttpStatus.OK)
  async predict(
    @Body() predictTrackDto: PredictTrackDto,
  ): Promise<PredictionResponseDto> {
    return this.spotifyPredictorService.predict(predictTrackDto);
  }

  @Post('reload')
  @HttpCode(HttpStatus.OK)
  async reloadModel(): Promise<{ success: boolean; message: string }> {
    return this.spotifyPredictorService.reloadModel();
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  async health(): Promise<{ status: string; message: string }> {
    return {
      status: 'ok',
      message: 'Spotify Track Success Predictor API is running',
    };
  }
}

