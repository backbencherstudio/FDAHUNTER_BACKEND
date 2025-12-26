import { PartialType } from '@nestjs/swagger';
import { CreatePredictionDto } from './create-prediction.dto';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdatePredictionDto extends PartialType(CreatePredictionDto) {
  @IsOptional()
  @IsString()
  status?: string;
}
