import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDTO {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
