import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DocumentRecordDocument = DocumentRecord & Document;

export enum DocumentType {
  INVOICE = 'invoice',
  CONTRACT = 'contract',
  RECEIPT = 'receipt',
  REPORT = 'report',
  LAND_TITLE = 'land_title',
}

export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  SUSPICIOUS = 'suspicious',
  REJECTED = 'rejected',
}

export interface ExtractedData {
  companyName?: string | null;
  bin?: string | null;
  documentNumber?: string | null;
  date?: string | null;
  items?: any[];
  totalAmount?: number | null;
  supplier?: string | null;
}

@Schema({ timestamps: true })
export class DocumentRecord {
  @Prop({ required: true })
  companyId: string;
  
  @Prop({ required: true })
  subsidyId: string;
  
  @Prop({ required: true, enum: DocumentType })
  type: DocumentType;
  
  @Prop({ required: true })
  documentUrl: string;
  
  @Prop()
  fileName: string;
  
  @Prop()
  fileSize: number;
  
  @Prop({ type: Object, default: {} })
  extractedData: ExtractedData;
  
  @Prop({ type: Number, default: 0 })
  fraudScore: number;
  
  @Prop({ type: String, enum: VerificationStatus, default: VerificationStatus.PENDING })
  verificationStatus: VerificationStatus;
  
  @Prop()
  verifiedBy: string;
  
  @Prop()
  verifiedAt: Date;
  
  @Prop({ type: [String], default: [] })
  issues: string[];
}

export const DocumentRecordSchema = SchemaFactory.createForClass(DocumentRecord);

// Also export as DocumentSchema for backward compatibility
export const DocumentSchema = DocumentRecordSchema;

// Add indexes
DocumentRecordSchema.index({ companyId: 1 });
DocumentRecordSchema.index({ subsidyId: 1 });
DocumentRecordSchema.index({ verificationStatus: 1 });
DocumentRecordSchema.index({ fraudScore: -1 });