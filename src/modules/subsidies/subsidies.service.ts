import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subsidy, SubsidyDocument, SubsidyStatus } from './schemas/subsidy.schema';
import { CompaniesService } from '../companies/companies.service';

@Injectable()
export class SubsidiesService {
  constructor(
    @InjectModel(Subsidy.name) private subsidyModel: Model<SubsidyDocument>,
    private companiesService: CompaniesService,
  ) {}
  
  async create(subsidyData: Partial<Subsidy>): Promise<Subsidy> {
    const subsidy = new this.subsidyModel({
      ...subsidyData,
      applicationDate: new Date(),
      auditTrail: [{
        action: 'APPLICATION_SUBMITTED',
        userId: subsidyData.metadata?.userId,
        timestamp: new Date(),
        notes: 'Subsidy application submitted',
      }],
    });
    
    return subsidy.save();
  }
  
  async findAll(): Promise<Subsidy[]> {
    return this.subsidyModel.find().sort({ applicationDate: -1 }).exec();
  }
  
  async findByCompany(companyId: string): Promise<Subsidy[]> {
    return this.subsidyModel.find({ companyId }).sort({ applicationDate: -1 }).exec();
  }
  
  async findById(id: string): Promise<Subsidy | null> {
    return this.subsidyModel.findById(id).exec();
  }
  
  async updateStatus(id: string, status: SubsidyStatus, userId: string, notes?: string): Promise<Subsidy> {
    const subsidy = await this.subsidyModel.findByIdAndUpdate(
      id,
      {
        status,
        ...(status === SubsidyStatus.APPROVED && { approvalDate: new Date() }),
        ...(status === SubsidyStatus.DISBURSED && { disbursementDate: new Date() }),
        $push: {
          auditTrail: {
            action: `STATUS_CHANGED_TO_${status}`,
            userId,
            timestamp: new Date(),
            notes: notes || `Status updated to ${status}`,
          },
        },
      },
      { new: true }
    );
    
    if (!subsidy) {
      throw new NotFoundException('Subsidy not found');
    }
    
    return subsidy;
  }
  
  async getStats(): Promise<any> {
    const totalApplied = await this.subsidyModel.countDocuments();
    const totalApproved = await this.subsidyModel.countDocuments({ status: SubsidyStatus.APPROVED });
    const totalDisbursed = await this.subsidyModel.countDocuments({ status: SubsidyStatus.DISBURSED });
    const underInvestigation = await this.subsidyModel.countDocuments({ status: SubsidyStatus.UNDER_INVESTIGATION });
    
    const totalAmount = await this.subsidyModel.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    
    const byType = await this.subsidyModel.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, amount: { $sum: '$amount' } } },
    ]);
    
    return {
      totalApplications: totalApplied,
      approved: totalApproved,
      disbursed: totalDisbursed,
      underInvestigation,
      totalAmount: totalAmount[0]?.total || 0,
      byType,
    };
  }
  
  async getDiscrepancyReport(): Promise<any[]> {
    // Find subsidies where disbursed amount significantly differs from reported yields
    const subsidies = await this.subsidyModel.aggregate([
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'company',
        },
      },
      { $unwind: '$company' },
      {
        $project: {
          applicationNumber: 1,
          amount: 1,
          type: 1,
          status: 1,
          companyName: '$company.name',
          companyTrustScore: '$company.trustScore.score',
          reportedYield: '$company.reportedYield',
          subsidyPerHectare: { $divide: ['$amount', '$requestedArea'] },
        },
      },
    ]);
    
    return subsidies;
  }
}