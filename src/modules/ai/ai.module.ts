import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { FraudDetectionService } from './fraud-detection.service';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { Subsidy, SubsidySchema } from '../subsidies/schemas/subsidy.schema';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: Subsidy.name, schema: SubsidySchema },
    ]),
    CompaniesModule,
  ],
  controllers: [AiController],
  providers: [AiService, FraudDetectionService],
  exports: [AiService, FraudDetectionService],
})
export class AiModule {}