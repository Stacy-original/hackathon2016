import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DocumentRecord, DocumentRecordDocument, VerificationStatus } from './schemas/document.schema';
import { AiService } from '../ai/ai.service';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectModel(DocumentRecord.name) private documentModel: Model<DocumentRecordDocument>,
    private aiService: AiService,
  ) {}
  
  async create(documentData: Partial<DocumentRecord>): Promise<DocumentRecord> {
    const document = new this.documentModel(documentData);
    return document.save();
  }
  
  async verifyDocument(id: string, imageBuffer: Buffer): Promise<any> {
    const scanResult = await this.aiService.scanDocument(imageBuffer);
    
    const updateData: any = {
      extractedData: scanResult.extractedData,
      fraudScore: scanResult.fraudScore,
    };
    
    if (scanResult.fraudScore > 70) {
      updateData.verificationStatus = VerificationStatus.SUSPICIOUS;
      updateData.issues = scanResult.validation?.discrepancies || [];
    } else if (scanResult.fraudScore > 40) {
      updateData.verificationStatus = VerificationStatus.PENDING;
      updateData.issues = scanResult.validation?.discrepancies || [];
    } else {
      updateData.verificationStatus = VerificationStatus.VERIFIED;
    }
    
    const document = await this.documentModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );
    
    return {
      document,
      scanResult,
    };
  }
  
  async getDocumentsByCompany(companyId: string): Promise<DocumentRecord[]> {
    return this.documentModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }
  
  async getSuspiciousDocuments(): Promise<DocumentRecord[]> {
    return this.documentModel.find({
      verificationStatus: VerificationStatus.SUSPICIOUS,
    }).sort({ createdAt: -1 }).exec();
  }
}