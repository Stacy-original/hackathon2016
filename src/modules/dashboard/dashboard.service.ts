import { Injectable } from '@nestjs/common';
import { CompaniesService } from '../companies/companies.service';
import { SubsidiesService } from '../subsidies/subsidies.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DashboardService {
  constructor(
    private companiesService: CompaniesService,
    private subsidiesService: SubsidiesService,
    private aiService: AiService,
  ) {}
  
  async getGovernmentDashboard() {
    const [companyStats, subsidyStats, riskDashboard] = await Promise.all([
      this.companiesService.getStats(),
      this.subsidiesService.getStats(),
      this.aiService.getRiskDashboard(),
    ]);
    
    const highRiskCompanies = await this.companiesService.getHighRiskCompanies();
    
    return {
      overview: {
        totalCompanies: companyStats.total,
        totalSubsidies: subsidyStats.totalAmount,
        activeSubsidies: (subsidyStats.approved || 0) + (subsidyStats.disbursed || 0),
        highRiskCompanies: companyStats.riskDistribution?.high || 0,
      },
      riskMetrics: riskDashboard,
      subsidyMetrics: subsidyStats,
      companyMetrics: companyStats,
      highRiskCompaniesList: highRiskCompanies.map(c => ({
        id: (c as any)._id?.toString() || '',
        name: c.name,
        trustScore: c.trustScore?.score || 0,
        subsidiesReceived: c.totalSubsidiesReceived,
        status: c.status,
      })),
      generatedAt: new Date(),
    };
  }
  
  async getCompanyDashboard(companyId: string) {
    const company = await this.companiesService.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }
    
    const subsidies = await this.subsidiesService.findByCompany(companyId);
    const auditResult = await this.aiService.runFullAudit(companyId);
    
    const subsidyByType = subsidies.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + s.amount;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      company: {
        id: (company as any)._id?.toString() || '',
        name: company.name,
        bin: company.bin,
        trustScore: company.trustScore,
        status: company.status,
        totalLandArea: company.totalLandArea,
        cultivatedArea: company.cultivatedArea,
      },
      subsidies: {
        total: subsidies.reduce((sum, s) => sum + s.amount, 0),
        byType: subsidyByType,
        applications: subsidies.length,
        pending: subsidies.filter(s => s.status === 'applied').length,
        approved: subsidies.filter(s => s.status === 'approved').length,
        disbursed: subsidies.filter(s => s.status === 'disbursed').length,
      },
      audit: auditResult,
      generatedAt: new Date(),
    };
  }
  
  async getPublicDashboard() {
    const companyStats = await this.companiesService.getStats();
    const topPerformers = await this.companiesService.getTopPerformers(5);
    
    return {
      statistics: {
        totalCompanies: companyStats.total,
        totalSubsidies: companyStats.totalSubsidies,
        highRiskCompanies: companyStats.riskDistribution?.high || 0,
        mediumRiskCompanies: companyStats.riskDistribution?.medium || 0,
        lowRiskCompanies: companyStats.riskDistribution?.low || 0,
      },
      topPerformers: topPerformers.map(c => ({
        name: c.name,
        trustScore: c.trustScore?.score || 0,
        subsidiesReceived: c.totalSubsidiesReceived,
        cultivatedArea: c.cultivatedArea,
      })),
      lastUpdated: new Date(),
    };
  }
}