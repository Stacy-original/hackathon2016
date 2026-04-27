import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SubsidiesService } from './subsidies.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole, SubsidyStatus } from '../../common/interfaces/user.interface';

@Controller('subsidies')
@UseGuards(RolesGuard)
export class SubsidiesController {
  constructor(private readonly subsidiesService: SubsidiesService) {}
  
  @Post()
  @Roles(UserRole.USER, UserRole.GOVERNMENT, UserRole.ADMIN)
  async createSubsidy(@Body() subsidyData: any) {
    return this.subsidiesService.create(subsidyData);
  }
  
  @Get()
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getAllSubsidies() {
    return this.subsidiesService.findAll();
  }
  
  @Get('stats')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getStats() {
    return this.subsidiesService.getStats();
  }
  
  @Get('discrepancy-report')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getDiscrepancyReport() {
    return this.subsidiesService.getDiscrepancyReport();
  }
  
  @Get('company/:companyId')
  async getSubsidiesByCompany(@Param('companyId') companyId: string) {
    return this.subsidiesService.findByCompany(companyId);
  }
  
  @Get(':id')
  async getSubsidyById(@Param('id') id: string) {
    const subsidy = await this.subsidiesService.findById(id);
    if (!subsidy) {
      return { error: 'Subsidy not found' };
    }
    return subsidy;
  }
  
  @Put(':id/status')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: SubsidyStatus,
    @Body('userId') userId: string,
    @Body('notes') notes?: string,
  ) {
    return this.subsidiesService.updateStatus(id, status, userId, notes);
  }
}