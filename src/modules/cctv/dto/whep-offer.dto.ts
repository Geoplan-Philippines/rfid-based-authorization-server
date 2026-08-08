import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WhepOfferDto {
  @IsString()
  @IsNotEmpty()
  sdp: string;

  @IsString()
  @IsOptional()
  streamId?: string = 'eagle_cam_sub';
}
