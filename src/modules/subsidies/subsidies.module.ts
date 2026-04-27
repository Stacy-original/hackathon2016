import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubsidiesController } from './subsidies.controller';
import { SubsidiesService } from './subsidies.service';
import { Subsidy, SubsidySchema } from './schemas/subsidy.schema';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Subsidy.name, schema: SubsidySchema }]),
    CompaniesModule,
  ],
  controllers: [SubsidiesController],
  providers: [SubsidiesService],
  exports: [SubsidiesService],
})
export class SubsidiesModule {}