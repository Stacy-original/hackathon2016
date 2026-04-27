import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SubsidyDocument = Subsidy & Document;

export enum SubsidyStatus {
  APPLIED = 'applied',
  APPROVED = 'approved',
  DISBURSED = 'disbursed',
  REJECTED = 'rejected',
  UNDER_INVESTIGATION = 'under_investigation',
}

@Schema({ timestamps: true })
export class Subsidy {
  @Prop({ required: true })
  companyId: string;
  
  @Prop({ required: true })
  amount: number;
  
  @Prop({ required: true })
  type: string;
  
  @Prop()
  requestedArea: number;
  
  @Prop()
  approvedArea: number;
  
  @Prop({ type: String, enum: SubsidyStatus, default: SubsidyStatus.APPLIED })
  status: SubsidyStatus;
  
  @Prop()
  applicationDate: Date;
  
  @Prop()
  approvalDate: Date;
  
  @Prop()
  disbursementDate: Date;
  
  @Prop({ type: Array, default: [] })
  auditTrail: Array<{
    action: string;
    userId: string;
    timestamp: Date;
    notes?: string;
  }>;
  
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const SubsidySchema = SchemaFactory.createForClass(Subsidy);

// Add indexes
SubsidySchema.index({ companyId: 1 });
SubsidySchema.index({ status: 1 });
SubsidySchema.index({ applicationDate: -1 });