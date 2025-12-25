import { IsString } from 'class-validator';

export class CreatePredictionDto {
  @IsString()
  notes: string;

  @IsString()
  category_id: string;
}
