// modules/ai/dto/process-receipt.dto.ts
export class ReceiptItemDto {
  name: string;
  price: number;
  is_suspicious: boolean;
}

export class ReceiptAnalysisDto {
  stars: number;
  trust_level: 'HIGH' | 'MEDIUM' | 'LOW';
  verdict: string;
  risk_flags: string[];
}

export class ProcessReceiptResponseDto {
  success: boolean;
  receiptId: string;
  extractedData: {
    vendor: string;
    items: ReceiptItemDto[];
    analysis: ReceiptAnalysisDto;
  };
  trustScore: number;
  trustLevel: string;
  fraudScore: number;
  isFraudulent: boolean;
  recommendations: string[];
  company: {
    id: string;
    name: string;
    bin: string;
    trustScore: number;
    status: string;
  } | null;
  createdAt: Date;
}