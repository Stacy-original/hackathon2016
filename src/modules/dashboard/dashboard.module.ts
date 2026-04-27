import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { CompaniesModule } from '../companies/companies.module';
import { SubsidiesModule } from '../subsidies/subsidies.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [CompaniesModule, SubsidiesModule, AiModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}