import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as Tesseract from 'tesseract.js';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { FraudDetectionService } from './fraud-detection.service';
import { CompaniesService } from '../companies/companies.service';
import { CompanyStatus } from '../../common/interfaces/user.interface';

interface ExtractedData {
  companyName: string | null;
  bin: string | null;
  documentNumber: string | null;
  date: string | null;
  items: any[];
  totalAmount: number | null;
  supplier: string | null;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private fraudDetectionService: FraudDetectionService,
    private companiesService: CompaniesService,
  ) {}
  
  async scanDocument(imageBuffer: Buffer): Promise<any> {
    try {
      const { data } = await Tesseract.recognize(imageBuffer, 'rus+eng', {
        logger: (m) => console.log(m),
      });
      
      const extractedText = data.text;
      const extractedData = this.extractDocumentData(extractedText);
      const validation = await this.validatePrices(extractedData);
      
      return {
        success: true,
        extractedText: extractedText.substring(0, 500),
        extractedData: extractedData,
        validation: validation,
        fraudScore: validation.fraudScore,
      };
    } catch (error) {
      this.logger.error(`Document scan failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  private extractDocumentData(text: string): ExtractedData {
    const lines = text.split('\n');
    const extractedData: ExtractedData = {
      companyName: null,
      bin: null,
      documentNumber: null,
      date: null,
      items: [],
      totalAmount: null,
      supplier: null,
    };
    
    for (const line of lines) {
      const binMatch = line.match(/\b\d{12}\b/);
      if (binMatch && !extractedData.bin) {
        extractedData.bin = binMatch[0];
      }
      
      const dateMatch = line.match(/\b\d{2}[./]\d{2}[./]\d{4}\b/);
      if (dateMatch && !extractedData.date) {
        extractedData.date = dateMatch[0];
      }
      
      const docMatch = line.match(/(?:№|\#)\s*(\d+)/i);
      if (docMatch && !extractedData.documentNumber) {
        extractedData.documentNumber = docMatch[1];
      }
      
      const amountMatches = line.match(/(\d+[\s]?\d*)\s*(?:тенге|тг|₸|tenge)/i);
      if (amountMatches && !extractedData.totalAmount) {
        extractedData.totalAmount = parseInt(amountMatches[1].replace(/\s/g, ''));
      }
    }
    
    return extractedData;
  }
  
  private async validatePrices(extractedData: ExtractedData): Promise<any> {
    const marketPrices = {
      fertilizer: {
        urea: 180,
        ammophos: 220,
        potash: 160,
      },
      seeds: {
        wheat: 120,
        corn: 250,
        sunflower: 180,
      },
      fuel: {
        diesel: 280,
      },
    };
    
    let fraudScore = 0;
    const discrepancies: string[] = [];
    
    if (extractedData.totalAmount && extractedData.totalAmount > 50000000) {
      fraudScore += 20;
      discrepancies.push('Total amount exceeds normal range (>50M tenge)');
    }
    
    if (extractedData.bin) {
      try {
        const company = await this.companyModel.findOne({ bin: extractedData.bin });
        if (!company) {
          fraudScore += 30;
          discrepancies.push('Company with provided BIN not found in registry');
        }
      } catch (error) {
        this.logger.error(`Error checking BIN: ${error.message}`);
      }
    }
    
    return {
      fraudScore: Math.min(fraudScore, 100),
      isFraudulent: fraudScore > 50,
      discrepancies: discrepancies,
      marketComparison: marketPrices,
    };
  }
  
  async runFullAudit(companyId: string): Promise<any> {
    this.logger.log(`Starting full audit for company ${companyId}`);
    
    const anomalies = await this.fraudDetectionService.detectAnomalies();
    const companyAnomalies = anomalies.filter(a => a.companyId === companyId);
    const trustScore = await this.fraudDetectionService.calculateTrustScore(companyId);
    
    if (trustScore) {
      await this.companiesService.updateTrustScore(companyId, trustScore);
    }
    
    if (trustScore && trustScore.score < 30) {
      await this.companiesService.updateStatus(companyId, CompanyStatus.SUSPENDED);
    }
    
    return {
      companyId: companyId,
      trustScore: trustScore,
      anomalies: companyAnomalies,
      auditDate: new Date(),
      recommendations: this.generateRecommendations(trustScore, companyAnomalies),
    };
  }
  
  private generateRecommendations(trustScore: any, anomalies: any[]): string[] {
    const recommendations: string[] = [];
    
    if (trustScore && trustScore.score < 40) {
      recommendations.push('Schedule detailed field inspection');
      recommendations.push('Require additional documentation for all subsidies');
    }
    
    if (trustScore && trustScore.score < 60) {
      recommendations.push('Conduct document verification');
      recommendations.push('Increase monitoring frequency');
    }
    
    anomalies.forEach(anomaly => {
      if (anomaly.type === 'subsidy_anomaly') {
        recommendations.push(`Investigate subsidy discrepancy: ${anomaly.description}`);
      }
      if (anomaly.type === 'land_usage_anomaly') {
        recommendations.push('Verify land cultivation with satellite imagery');
      }
    });
    
    if (recommendations.length === 0) {
      recommendations.push('No immediate action required - continue regular monitoring');
    }
    
    return recommendations;
  }
  
  async getRiskDashboard(): Promise<any> {
    const allCompanies = await this.companyModel.find().exec();
    const anomalies = await this.fraudDetectionService.detectAnomalies();
    
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    const highAnomalies = anomalies.filter(a => a.severity === 'high');
    const mediumAnomalies = anomalies.filter(a => a.severity === 'medium');
    
    const riskDistribution = {
      low: allCompanies.filter(c => (c.trustScore?.score || 50) >= 70).length,
      medium: allCompanies.filter(c => {
        const score = c.trustScore?.score || 50;
        return score >= 40 && score < 70;
      }).length,
      high: allCompanies.filter(c => (c.trustScore?.score || 50) < 40).length,
    };
    
    const highRiskCompanies = allCompanies
      .filter(c => (c.trustScore?.score || 50) < 40)
      .sort((a, b) => (a.trustScore?.score || 50) - (b.trustScore?.score || 50))
      .slice(0, 5)
      .map(c => ({
        id: c._id.toString(),
        name: c.name,
        trustScore: c.trustScore?.score || 50,
        status: c.status,
      }));
    
    return {
      summary: {
        totalCompanies: allCompanies.length,
        anomaliesDetected: anomalies.length,
        criticalAnomalies: criticalAnomalies.length,
        highAnomalies: highAnomalies.length,
        mediumAnomalies: mediumAnomalies.length,
      },
      riskDistribution: riskDistribution,
      highRiskCompanies: highRiskCompanies,
      recentAnomalies: anomalies.slice(0, 10).map(a => ({
        ...a,
        detectedAt: new Date(),
      })),
      lastUpdated: new Date(),
    };
  }
}