import { IsNotEmpty, IsUrl } from 'class-validator';

export class VerifyByUrlDTO {
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @IsNotEmpty()
  imageUrl!: string;
}
