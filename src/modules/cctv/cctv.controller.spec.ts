import { Test, TestingModule } from '@nestjs/testing';
import { CctvController } from './cctv.controller';
import { CctvService } from './cctv.service';

describe('CctvController', () => {
  let controller: CctvController;
  let service: CctvService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CctvController],
      providers: [
        {
          provide: CctvService,
          useValue: {
            getStreams: jest.fn().mockResolvedValue([
              {
                id: 'eagle_cam_sub',
                name: 'Eagle Cement Sub Stream (Fast)',
                channel: 'Channel 102',
                resolution: 'SD (Fast Load)',
                isOnline: true,
              },
            ]),
            handleWhepOffer: jest.fn().mockResolvedValue({ sdp: 'v=0...' }),
          },
        },
      ],
    }).compile();

    controller = module.get<CctvController>(CctvController);
    service = module.get<CctvService>(CctvService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return list of streams', async () => {
    const result = await controller.getStreams();
    expect(result.streams).toHaveLength(1);
    expect(result.streams[0].id).toBe('eagle_cam_sub');
  });

  it('should handle WHEP offer', async () => {
    const result = await controller.handleWhepOffer({ sdp: 'v=0...' });
    expect(result.sdp).toBe('v=0...');
  });
});
