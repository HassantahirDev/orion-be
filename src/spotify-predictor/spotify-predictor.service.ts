import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { PredictTrackDto } from './dto/predict-track.dto';
import { PredictionResponseDto } from './dto/prediction-response.dto';
import * as fs from 'fs';

interface ModelData {
  coefficients: number[];
  intercept: number;
  feature_order: string[];
}

interface ScalerData {
  mean: number[];
  scale: number[];
  feature_order: string[];
}

@Injectable()
export class SpotifyPredictorService {
  private readonly logger = new Logger(SpotifyPredictorService.name);
  private readonly modelPath = join(process.cwd(), 'model');
  private modelData: ModelData | null = null;
  private scalerData: ScalerData | null = null;

  constructor() {
    this.loadModel();
  }

  private loadModel(): void {
    try {
      const modelFile = join(this.modelPath, 'model.json');
      const scalerFile = join(this.modelPath, 'scaler.json');

      if (!fs.existsSync(modelFile) || !fs.existsSync(scalerFile)) {
        this.logger.warn(
          'Model files not found. Please train the model using the Jupyter notebook first.',
        );
        return;
      }

      const modelJson = fs.readFileSync(modelFile, 'utf-8');
      const scalerJson = fs.readFileSync(scalerFile, 'utf-8');

      this.modelData = JSON.parse(modelJson) as ModelData;
      this.scalerData = JSON.parse(scalerJson) as ScalerData;

      this.logger.log('Model and scaler loaded successfully');
    } catch (error) {
      this.logger.error(`Error loading model: ${error.message}`, error.stack);
    }
  }

  private sigmoid(z: number): number {
    // Prevent overflow
    if (z > 700) return 1;
    if (z < -700) return 0;
    return 1 / (1 + Math.exp(-z));
  }

  private standardScale(features: number[], mean: number[], scale: number[]): number[] {
    return features.map((val, idx) => (val - mean[idx]) / scale[idx]);
  }

  async predict(trackData: PredictTrackDto): Promise<PredictionResponseDto> {
    try {
      if (!this.modelData || !this.scalerData) {
        throw new BadRequestException(
          'Model not loaded. Please train the model using the Jupyter notebook first.',
        );
      }

      // Prepare input data in the correct feature order
      const featureOrder = this.modelData.feature_order;
      const inputFeatures = featureOrder.map((feature) => {
        switch (feature) {
          case 'danceability':
            return trackData.danceability;
          case 'energy':
            return trackData.energy;
          case 'loudness':
            return trackData.loudness;
          case 'tempo':
            return trackData.tempo;
          case 'duration_ms':
            return trackData.duration_ms;
          case 'artist_popularity':
            // Optional feature - use 0 as default if not provided
            return trackData.artist_popularity ?? 0;
          default:
            throw new Error(`Unknown feature: ${feature}`);
        }
      });

      // Scale features
      const scaledFeatures = this.standardScale(
        inputFeatures,
        this.scalerData.mean,
        this.scalerData.scale,
      );

      // Calculate z = intercept + sum(coefficient[i] * feature[i])
      let z = this.modelData.intercept;
      for (let i = 0; i < scaledFeatures.length; i++) {
        z += this.modelData.coefficients[i] * scaledFeatures[i];
      }

      // Calculate probability using sigmoid function
      const probability = this.sigmoid(z);
      const isSuccessful = probability >= 0.5;

      return {
        success_probability: Math.round(probability * 100 * 100) / 100, // Round to 2 decimal places
        is_likely_successful: isSuccessful,
        message: isSuccessful
          ? 'Likely Successful'
          : 'Not Likely Successful',
      };
    } catch (error) {
      this.logger.error(`Prediction error: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Prediction failed: ${error.message}`,
      );
    }
  }

  async reloadModel(): Promise<{ success: boolean; message: string }> {
    try {
      this.loadModel();
      if (this.modelData && this.scalerData) {
        return {
          success: true,
          message: 'Model reloaded successfully',
        };
      } else {
        return {
          success: false,
          message: 'Model files not found',
        };
      }
    } catch (error) {
      this.logger.error(`Model reload error: ${error.message}`, error.stack);
      return {
        success: false,
        message: `Failed to reload model: ${error.message}`,
      };
    }
  }
}
