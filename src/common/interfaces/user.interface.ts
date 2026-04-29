export enum UserRole {
  USER = 0,
  EDITOR = 1,
  GOVERNMENT = 1,  // Keep as alias for EDITOR
  ADMIN = 2
}

export interface User {
  id: string;
  name: string;
  email: string;
  photo?: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin: Date;
  lastActivity: Date;
}

// Rest of your interfaces remain the same...
export enum CompanyStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  SUSPENDED = 'suspended',
  UNDER_REVIEW = 'under_review',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum SubsidyStatus {
  APPLIED = 'applied',
  APPROVED = 'approved',
  DISBURSED = 'disbursed',
  REJECTED = 'rejected',
  UNDER_INVESTIGATION = 'under_investigation',
}

export enum TrustLevel {
  LOW = 'low',      // 0-39 points
  MEDIUM = 'medium', // 40-69 points
  HIGH = 'high',     // 70-100 points
}

export interface TrustScore {
  score: number; // 0-100
  level: TrustLevel;
  factors: {
    subsidyCompliance: number;    // 0-100
    documentQuality: number;       // 0-100
    landUsage: number;             // 0-100
    reportingConsistency: number;  // 0-100
    anomalyDetection: number;      // 0-100
  };
  lastCalculated: Date;
}

export interface FraudAlert {
  id: string;
  companyId: string;
  companyName: string;
  type: 'subsidy_anomaly' | 'price_inflation' | 'supply_chain_break' | 'document_fraud' | 'yield_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  detectedAt: Date;
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  evidence: any;
  recommendedAction?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  targetId: string;
  targetType: string;
  details: any;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}