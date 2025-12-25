import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateUserDto {
  @IsNotEmpty()
  @ApiProperty()
  name?: string;

  @IsOptional()
  @ApiProperty()
  first_name?: string;

  @IsOptional()
  @ApiProperty()
  last_name?: string;

  @IsNotEmpty()
  @ApiProperty()
  email?: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'Password should be minimum 8' })
  @ApiProperty()
  password: string;

  @ApiProperty({
    type: String,
    example: 'user',
  })
  type?: string;
}


export class CreatePreferences {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value : [value],
  )
  user_preferences: string[];
}