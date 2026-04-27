import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/interfaces/user.interface';

@Controller('dashboard')
@UseGuards(RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}
  
  @Get('government')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getGovernmentDashboard() {
    return this.dashboardService.getGovernmentDashboard();
  }
  
  @Get('company/:companyId')
  @Roles(UserRole.GOVERNMENT, UserRole.ADMIN)
  async getCompanyDashboard(@Param('companyId') companyId: string) {
    return this.dashboardService.getCompanyDashboard(companyId);
  }
  
  @Get('public')
  async getPublicDashboard() {
    return this.dashboardService.getPublicDashboard();
  }
}