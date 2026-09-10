import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateDriverDTO } from './create-driver.dto';
import { UpdateDriverDTO } from './update-driver.dto';

const VALID_DRIVER = {
  driverId: 'DRV-00001',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  licenseNumber: 'N01-23-456789',
};

describe('CreateDriverDTO', () => {
  it('accepts the first locked-format driver id', async () => {
    const errors = await validate(plainToInstance(CreateDriverDTO, VALID_DRIVER));

    expect(errors).toHaveLength(0);
  });

  it.each([
    ['a missing id', undefined],
    ['a UUID', '8bea9b1f-5ae7-465d-a646-4f66a2a5f501'],
    ['the year-based DRB shape', 'DRB-2026-001'],
    ['the zero sequence', 'DRV-00000'],
  ])('rejects %s', async (_case, driverId) => {
    const value = driverId === undefined
      ? { ...VALID_DRIVER, driverId: undefined }
      : { ...VALID_DRIVER, driverId };
    const errors = await validate(plainToInstance(CreateDriverDTO, value));

    expect(errors.map((error) => error.property)).toContain('driverId');
  });

  it('rejects changing the permanent driver id on update', async () => {
    const pipe = new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    });

    await expect(
      pipe.transform(
        { driverId: 'DRV-00002' },
        { type: 'body', metatype: UpdateDriverDTO },
      ),
    ).rejects.toThrow();
  });
});
