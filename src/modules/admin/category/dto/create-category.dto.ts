import { IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  parent_name: string;

  @IsString()
  @IsOptional()
  parent_id: string;

  @IsString()
  @IsOptional()
  description: string;
}
