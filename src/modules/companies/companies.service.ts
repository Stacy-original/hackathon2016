import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument } from './schemas/company.schema';
import { CompanyStatus } from '../../common/interfaces/user.interface';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
  ) {}
  
  async create(companyData: Partial<Company>): Promise<Company> {
    const company = new this.companyModel({
      ...companyData,
      registeredAt: new Date(),
      trustScore: {
        score: 50,
        level: 'medium',
        factors: {
          subsidyCompliance: 50,
          documentQuality: 50,
          landUsage: 50,
          reportingConsistency: 50,
          anomalyDetection: 50,
        },
        lastCalculated: new Date(),
      },
    });
    
    return company.save();
  }
  
  async findAll(): Promise<Company[]> {
    return this.companyModel.find().sort({ createdAt: -1 }).exec();
  }
  
  async findByBin(bin: string): Promise<Company | null> {
    return this.companyModel.findOne({ bin }).exec();
  }
  
  async findById(id: string): Promise<Company | null> {
    return this.companyModel.findById(id).exec();
  }
  
  async updateTrustScore(companyId: string, trustScore: any): Promise<Company> {
    const company = await this.companyModel.findByIdAndUpdate(
      companyId,
      { 
        trustScore: {
          ...trustScore,
          lastCalculated: new Date(),
        },
        lastAuditDate: new Date(),
      },
      { new: true }
    );
    
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    
    return company;
  }
  
  async updateStatus(companyId: string, status: CompanyStatus): Promise<Company> {
    const company = await this.companyModel.findByIdAndUpdate(
      companyId,
      { status, lastAuditDate: new Date() },
      { new: true }
    );
    
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    
    return company;
  }
  
  async getHighRiskCompanies(): Promise<Company[]> {
    return this.companyModel.find({
      'trustScore.score': { $lt: 40 },
      status: { $ne: CompanyStatus.SUSPENDED },
    }).sort({ 'trustScore.score': 1 }).exec();
  }
  
  async getTopPerformers(limit: number = 10): Promise<Company[]> {
    return this.companyModel.find({
      'trustScore.score': { $gte: 70 },
    }).sort({ 'trustScore.score': -1 }).limit(limit).exec();
  }
  
  async getStats(): Promise<any> {
    const total = await this.companyModel.countDocuments();
    const highRisk = await this.companyModel.countDocuments({
      'trustScore.score': { $lt: 40 },
    });
    const mediumRisk = await this.companyModel.countDocuments({
      'trustScore.score': { $gte: 40, $lt: 70 },
    });
    const lowRisk = await this.companyModel.countDocuments({
      'trustScore.score': { $gte: 70 },
    });
    
    const totalSubsidies = await this.companyModel.aggregate([
      { $group: { _id: null, total: { $sum: '$totalSubsidiesReceived' } } },
    ]);
    
    return {
      total,
      riskDistribution: {
        high: highRisk,
        medium: mediumRisk,
        low: lowRisk,
      },
      totalSubsidies: totalSubsidies[0]?.total || 0,
    };
  }
  
  async updateArea(companyId: string, cultivatedArea: number): Promise<Company> {
    const company = await this.companyModel.findByIdAndUpdate(
      companyId,
      { cultivatedArea, lastAuditDate: new Date() },
      { new: true }
    );
    
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    
    return company;
  }
}