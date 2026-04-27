import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { CompanyStatus } from '../../../common/interfaces/user.interface';

export type CompanyDocument = Company & Document;

export class TrustScoreFactors {
  @Prop({ type: Number, default: 50 })
  subsidyCompliance: number;
  
  @Prop({ type: Number, default: 50 })
  documentQuality: number;
  
  @Prop({ type: Number, default: 50 })
  landUsage: number;
  
  @Prop({ type: Number, default: 50 })
  reportingConsistency: number;
  
  @Prop({ type: Number, default: 50 })
  anomalyDetection: number;
}

export class TrustScore {
  @Prop({ type: Number, default: 50 })
  score: number;
  
  @Prop({ type: String, default: 'medium' })
  level: string;
  
  @Prop({ type: TrustScoreFactors, default: {} })
  factors: TrustScoreFactors;
  
  @Prop({ type: Date, default: Date.now })
  lastCalculated: Date;
}

export class CompanyLocation {
  @Prop({ type: Number })
  lat: number;
  
  @Prop({ type: Number })
  lng: number;
  
  @Prop({ type: String })
  region: string;
  
  @Prop({ type: String })
  district: string;
}

@Schema({ timestamps: true })
export class Company {
  @Prop({ required: true, unique: true })
  bin: string;
  
  @Prop({ required: true })
  name: string;
  
  @Prop({ type: String })
  legalAddress: string;
  
  @Prop({ type: String })
  actualAddress: string;
  
  @Prop({ type: String })
  phone: string;
  
  @Prop({ type: String })
  email: string;
  
  @Prop({ type: String })
  director: string;
  
  @Prop({ type: String, default: CompanyStatus.PENDING })
  status: CompanyStatus;
  
  @Prop({ type: Object, default: {} })
  trustScore: {
    score: number;
    level: string;
    factors: {
      subsidyCompliance: number;
      documentQuality: number;
      landUsage: number;
      reportingConsistency: number;
      anomalyDetection: number;
    };
    lastCalculated: Date;
  };
  
  @Prop({ type: Number, default: 0 })
  totalLandArea: number;
  
  @Prop({ type: Number, default: 0 })
  cultivatedArea: number;
  
  @Prop({ type: Number, default: 0 })
  totalSubsidiesReceived: number;
  
  @Prop({ type: Number, default: 0 })
  reportedYield: number;
  
  @Prop({ type: Object, default: {} })
  location: {
    lat: number;
    lng: number;
    region: string;
    district: string;
  };
  
  @Prop({ type: [String], default: [] })
  cropTypes: string[];
  
  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
  
  @Prop({ type: Date })
  registeredAt: Date;
  
  @Prop({ type: Date })
  lastAuditDate: Date;
}

export const CompanySchema = SchemaFactory.createForClass(Company);

CompanySchema.index({ bin: 1 });
CompanySchema.index({ status: 1 });
CompanySchema.index({ 'trustScore.score': -1 });
CompanySchema.index({ totalSubsidiesReceived: -1 });
CompanySchema.index({ 'location.region': 1 });