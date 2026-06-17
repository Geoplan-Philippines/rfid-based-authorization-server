import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDTO {
  @IsString()
  @MinLength(2)
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
