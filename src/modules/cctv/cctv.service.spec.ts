import { Test, TestingModule } from '@nestjs/testing';
import { CctvService } from './cctv.service';

describe('CctvService', () => {
  let service: CctvService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CctvService],
    }).compile();

    service = module.get<CctvService>(CctvService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return available stream metadata', async () => {
    const streams = await service.getStreams();
    expect(streams).toHaveLength(2);
    expect(streams[0].id).toBe('eagle_cam_sub');
    expect(streams[1].id).toBe('eagle_cam_main');
  });
});
