import { Module } from '@nestjs/common';
import { PlateRecognitionService } from './plate-recognition.service';
import { PlateRecognitionController } from './plate-recognition.controller';

@Module({
  controllers: [PlateRecognitionController],
  providers: [PlateRecognitionService],
})
export class PlateRecognitionModule {}
