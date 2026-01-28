import { IsNumber, Min, Max, IsOptional } from 'class-validator';

export class PredictTrackDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  danceability: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  energy: number;

  @IsNumber()
  @Min(-60)
  @Max(50)
  loudness: number;

  @IsNumber()
  @Min(0)
  tempo: number;

  @IsNumber()
  @Min(0)
  duration_ms: number;

  // Optional - not used in current model but kept for API compatibility
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  artist_popularity?: number;
}

