import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole, CompanyStatus } from '../../common/interfaces/user.interface';

@Controller('companies')
@UseGuards(RolesGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}
  
  @Post()
  @Roles(UserRole.ADMIN, UserRole.GOVERNMENT)
  async createCompany(@Body() companyData: any) {
    return this.companiesService.create(companyData);
  }
  
  @Get()
  async getAllCompanies() {
    return this.companiesService.findAll();
  }
  
  @Get('high-risk')
  async getHighRiskCompanies() {
    return this.companiesService.getHighRiskCompanies();
  }
  
  @Get('top-performers')
  async getTopPerformers(@Query('limit') limit: number = 10) {
    return this.companiesService.getTopPerformers(limit);
  }
  
  @Get('stats')
  async getStats() {
    return this.companiesService.getStats();
  }
  
  @Get(':id')
  async getCompanyById(@Param('id') id: string) {
    const company = await this.companiesService.findById(id);
    if (!company) {
      return { error: 'Company not found' };
    }
    return company;
  }
  
  @Get('bin/:bin')
  async getCompanyByBin(@Param('bin') bin: string) {
    const company = await this.companiesService.findByBin(bin);
    if (!company) {
      return { error: 'Company not found' };
    }
    return company;
  }
  
  @Put(':id/trust-score')
  @Roles(UserRole.ADMIN, UserRole.GOVERNMENT)
  async updateTrustScore(@Param('id') id: string, @Body() trustScore: any) {
    return this.companiesService.updateTrustScore(id, trustScore);
  }
  
  @Put(':id/status')
  @Roles(UserRole.ADMIN, UserRole.GOVERNMENT)
  async updateStatus(@Param('id') id: string, @Body('status') status: CompanyStatus) {
    return this.companiesService.updateStatus(id, status);
  }
  
  @Put(':id/area')
  async updateArea(@Param('id') id: string, @Body('cultivatedArea') cultivatedArea: number) {
    return this.companiesService.updateArea(id, cultivatedArea);
  }
}