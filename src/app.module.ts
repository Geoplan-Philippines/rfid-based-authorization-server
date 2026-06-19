import { Module, ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { RateLimitModule } from './core/security/rate-limit.module';
import { HealthModule } from './core/health/health.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './core/database/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { EmailModule } from './modules/email/email.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { TrucksModule } from './modules/trucks/trucks.module';
import { TruckDriverAssignmentModule } from './modules/truck-driver-assignment/truck-driver-assignment.module';
import { PlateRecognitionModule } from './modules/plate-recognition/plate-recognition.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { RfidTagsModule } from './modules/rfid-tags/rfid-tags.module';

@Module({
  imports: [
    RateLimitModule,
    HealthModule,
    PrismaModule,
    UsersModule,
    AuthModule,
    EmailModule,
    DriversModule,
    TruckDriverAssignmentModule,
    TrucksModule,
    PlateRecognitionModule,
    TransactionsModule,
    RfidTagsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})

export class AppModule {}
