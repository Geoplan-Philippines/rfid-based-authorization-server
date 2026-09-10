import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RecordFaceReadDTO } from './record-face-read.dto';

describe('RecordFaceReadDTO', () => {
  it('accepts the Geoplan driver id used by the face gallery', async () => {
    const dto = plainToInstance(RecordFaceReadDTO, { driverId: 'DRV-00001' });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects the internal UUID as a face-read driver id', async () => {
    const dto = plainToInstance(RecordFaceReadDTO, {
      driverId: '8bea9b1f-5ae7-465d-a646-4f66a2a5f501',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('driverId');
  });
});
