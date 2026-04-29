// modules/ai/ai.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as Tesseract from 'tesseract.js';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { Subsidy, SubsidyDocument } from '../subsidies/schemas/subsidy.schema';
import { DocumentRecord, DocumentRecordDocument, VerificationStatus } from '../documents/schemas/document.schema';
import { CompanyStatus, TrustLevel } from '../../common/interfaces/user.interface';
import { FraudDetectionService } from './fraud-detection.service';
import { CompaniesService } from '../companies/companies.service';

export interface GeminiAuditResult {
  vendor: string;
  items: Array<{
    name: string;
    price: number;
    is_suspicious: boolean;
  }>;
  analysis: {
    stars: number;
    trust_level: 'HIGH' | 'MEDIUM' | 'LOW';
    verdict: string;
    risk_flags: string[];
  };
}

export interface ProcessedReceiptResult {
  success: boolean;
  receiptId: string;
  extractedData: GeminiAuditResult;
  trustScore: number;
  trustLevel: string;
  fraudScore: number;
  isFraudulent: boolean;
  recommendations: string[];
  company?: {
    id: string;
    name: string;
    bin: string;
    trustScore: number;
    status: string;
  } | null;
  createdAt: Date;
}

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
  private readonly geminiApiKey: string;
  private readonly geminiModelName: string;
  private readonly geminiApiUrl: string;

  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Subsidy.name) private subsidyModel: Model<SubsidyDocument>,
    @InjectModel(DocumentRecord.name) private documentModel: Model<DocumentRecordDocument>,
    private configService: ConfigService,
    private fraudDetectionService: FraudDetectionService,
    private companiesService: CompaniesService,
  ) {
    this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.geminiModelName = this.configService.get<string>('GEMINI_MODEL_NAME', 'gemini-1.5-flash');
    this.geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModelName}:generateContent?key=${this.geminiApiKey}`;
  }

  // ============ GEMINI RECEIPT PROCESSING (ENHANCED WITH BETTER RETRY) ============
  
  async processReceiptWithGemini(
    file: Express.Multer.File,
    companyId?: string,
  ): Promise<ProcessedReceiptResult> {
    try {
      // 1. Convert image to base64
      const base64Image = file.buffer.toString('base64');
      const mimeType = file.mimetype || 'image/jpeg';

      // 2. Build prompt for Gemini
      const prompt = this.buildReceiptAnalysisPrompt(companyId);

      // 3. Call Gemini API with retry logic (3 attempts as requested)
      const geminiResult = await this.callGeminiAPIWithRetry(prompt, base64Image, mimeType, 3);
      
      // 4. Calculate fraud score based on Gemini analysis
      const fraudScore = this.calculateFraudScore(geminiResult);
      
      // 5. Find or create company from vendor name
      let company: CompanyDocument | null = null;
      if (geminiResult.vendor && geminiResult.vendor !== 'Неизвестно') {
        company = await this.findOrCreateCompany(geminiResult.vendor);
      }
      
      // 6. Create document record in database
      const documentRecord = await this.createDocumentRecord(
        file,
        geminiResult,
        fraudScore,
        companyId || (company ? company._id.toString() : undefined),
      );
      
      // 7. Generate recommendations
      const recommendations = this.generateRecommendations(geminiResult, fraudScore);
      
      // 8. Update company trust score if company exists
      if (company) {
        await this.updateCompanyWithReceiptData(company._id.toString(), geminiResult, fraudScore);
      }

      // 9. Return processed result
      return {
        success: true,
        receiptId: documentRecord._id.toString(),
        extractedData: geminiResult,
        trustScore: geminiResult.analysis.stars * 20,
        trustLevel: geminiResult.analysis.trust_level,
        fraudScore: fraudScore,
        isFraudulent: fraudScore > 50,
        recommendations: recommendations,
        company: company ? {
          id: company._id.toString(),
          name: company.name,
          bin: company.bin,
          trustScore: company.trustScore?.score || 50,
          status: company.status,
        } : null,
        createdAt: new Date(),
      };
      
    } catch (error) {
      this.logger.error(`Failed to process receipt: ${error.message}`);
      throw new HttpException(
        `Failed to process receipt: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Enhanced retry logic that also retries on JSON parsing errors
  private async callGeminiAPIWithRetry(
    prompt: string, 
    base64Image: string, 
    mimeType: string,
    maxRetries: number = 3
  ): Promise<GeminiAuditResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`Calling Gemini API (attempt ${attempt}/${maxRetries})...`);
        
        // Call the API
        const rawResponse = await this.callGeminiAPIRaw(prompt, base64Image, mimeType);
        
        // Try to parse the response
        const result = this.safeParseGeminiResponse(rawResponse);
        
        // Validate the result has minimum required fields
        if (this.isValidGeminiResult(result)) {
          this.logger.log(`Successfully processed receipt on attempt ${attempt}`);
          return result;
        } else {
          throw new Error('Parsed result missing required fields');
        }
        
      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = 1000 * Math.pow(2, attempt - 1);
          this.logger.log(`Retrying in ${delay}ms... (${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If all retries failed, try one more time with a simplified prompt
    this.logger.warn('All retry attempts failed, attempting with simplified prompt...');
    try {
      const simplifiedPrompt = this.buildSimplifiedPrompt();
      const rawResponse = await this.callGeminiAPIRaw(simplifiedPrompt, base64Image, mimeType);
      const result = this.safeParseGeminiResponse(rawResponse);
      if (this.isValidGeminiResult(result)) {
        this.logger.log('Success with simplified prompt');
        return result;
      }
    } catch (finalError) {
      this.logger.error(`Simplified prompt also failed: ${finalError.message}`);
    }
    
    throw lastError || new Error('All Gemini API attempts failed');
  }

  private isValidGeminiResult(result: any): boolean {
    return result && 
           typeof result === 'object' &&
           result.analysis && 
           typeof result.analysis.stars === 'number' &&
           result.analysis.stars >= 0 && 
           result.analysis.stars <= 5;
  }

  private buildSimplifiedPrompt(): string {
    return `Extract receipt data. Return ONLY JSON: {"vendor":"","items":[],"analysis":{"stars":3,"trust_level":"MEDIUM","verdict":"ok","risk_flags":[]}}`;
  }

  private async callGeminiAPIRaw(prompt: string, base64Image: string, mimeType: string): Promise<string> {
    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 1024, // Reduced to avoid truncation
      },
    };

    const response = await axios.post(this.geminiApiUrl, payload, {
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.status !== 200) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const rawText = response.data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('No text response from Gemini');
    }

    this.logger.debug(`Raw Gemini response length: ${rawText.length}`);
    return rawText;
  }

  private buildReceiptAnalysisPrompt(companyId?: string): string {
    return `Ты — ИИ-аудитор системы мониторинга сельскохозяйственных субсидий в Казахстане.

ВАЖНО: Верни ТОЛЬКО валидный JSON объект. Никаких других символов, комментариев или пояснений вне JSON.

ЗАДАЧА:
Проанализируй чек/накладную на фото и предоставь структурированный JSON ответ.

ЧТО НУЖНО СДЕЛАТЬ:
1. Извлеки название компании-продавца или поставщика
2. Извлеки все товары/услуги с ценами (в тенге)
3. Отметь подозрительные позиции (цены выше рыночных на 30%+)
4. Выставь Trust Factor от 0 до 5 звезд:
   - 5 звезд: Все цены рыночные, чек легальный
   - 4 звезды: Небольшие отклонения от рыночных цен
   - 3 звезды: Есть подозрительные позиции
   - 2 звезды: Цены завышены в 2-3 раза
   - 1 звезда: Цены завышены в 3-5 раз
   - 0 звезд: Явные признаки мошенничества

ВЕРНИ ТОЛЬКО JSON:

{
  "vendor": "название компании",
  "items": [],
  "analysis": {
    "stars": 0,
    "trust_level": "LOW",
    "verdict": "краткое заключение",
    "risk_flags": []
  }
}`;
  }

  // Enhanced JSON parsing that tries multiple strategies
  private safeParseGeminiResponse(rawText: string): GeminiAuditResult {
    // Try multiple parsing strategies in order
    const strategies = [
      () => this.parseWithJsonParser(rawText),
      () => this.parseWithRegexExtraction(rawText),
      () => this.parseWithBraceMatching(rawText),
      () => this.parseWithEval(rawText),
    ];
    
    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = strategies[i]();
        if (result && this.isValidGeminiResult(result)) {
          this.logger.log(`Successfully parsed JSON using strategy ${i + 1}`);
          return result;
        }
      } catch (e) {
        this.logger.debug(`Strategy ${i + 1} failed: ${e.message}`);
      }
    }
    
    // If all strategies fail, return default
    this.logger.warn('All parsing strategies failed, returning default result');
    return this.getDefaultResult();
  }

  private parseWithJsonParser(text: string): GeminiAuditResult {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/```json\s*/gi, '');
    cleaned = cleaned.replace(/```\s*/g, '');
    return JSON.parse(cleaned);
  }

  private parseWithRegexExtraction(text: string): GeminiAuditResult {
    // Try to extract JSON using regex
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object found');
    
    let jsonStr = jsonMatch[0];
    
    // Fix common issues
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
    jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":'); // Add missing quotes to keys
    
    return JSON.parse(jsonStr);
  }

  private parseWithBraceMatching(text: string): GeminiAuditResult {
    let depth = 0;
    let start = -1;
    let end = -1;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    
    if (start === -1 || end === -1) throw new Error('No matching braces found');
    
    let jsonStr = text.substring(start, end + 1);
    
    // Add missing closing braces if needed
    const openBraces = (jsonStr.match(/{/g) || []).length;
    const closeBraces = (jsonStr.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      jsonStr += '}'.repeat(openBraces - closeBraces);
    }
    
    // Add missing closing brackets
    const openBrackets = (jsonStr.match(/\[/g) || []).length;
    const closeBrackets = (jsonStr.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      jsonStr += ']'.repeat(openBrackets - closeBrackets);
    }
    
    // Fix unterminated strings
    jsonStr = jsonStr.replace(/:\s*"([^"]*?)(?=["{,}\n]|$)/g, (match, content) => {
      if (!match.endsWith('"')) {
        return `: "${content}"`;
      }
      return match;
    });
    
    return JSON.parse(jsonStr);
  }

  private parseWithEval(text: string): GeminiAuditResult {
    // Last resort - use eval (safe in this context as we're parsing AI output)
    let cleaned = text.trim();
    cleaned = cleaned.replace(/```json\s*/gi, '');
    cleaned = cleaned.replace(/```\s*/g, '');
    
    // Try to find and extract just the JSON part
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      cleaned = match[0];
    }
    
    // Use Function constructor instead of eval directly (safer)
    const fn = new Function('return (' + cleaned + ')');
    return fn();
  }

  private getDefaultResult(): GeminiAuditResult {
    return {
      vendor: 'Неизвестно',
      items: [],
      analysis: {
        stars: 3,
        trust_level: 'MEDIUM',
        verdict: 'Чек обработан с некоторыми ограничениями',
        risk_flags: ['Ограниченное распознавание'],
      },
    };
  }

  private calculateFraudScore(geminiResult: GeminiAuditResult): number {
    let score = 0;
    
    const starsToScore = (5 - geminiResult.analysis.stars) * 20;
    score += starsToScore;
    
    const suspiciousCount = geminiResult.items.filter(i => i.is_suspicious).length;
    if (suspiciousCount > 0) {
      score += Math.min(30, suspiciousCount * 10);
    }
    
    if (geminiResult.analysis.risk_flags) {
      score += Math.min(20, geminiResult.analysis.risk_flags.length * 5);
    }
    
    if (geminiResult.analysis.trust_level === 'LOW') score += 15;
    if (geminiResult.analysis.trust_level === 'MEDIUM') score += 5;
    
    return Math.min(100, Math.max(0, score));
  }

  private async findOrCreateCompany(vendorName: string): Promise<CompanyDocument | null> {
    try {
      let company = await this.companyModel.findOne({ 
        name: { $regex: new RegExp(vendorName, 'i') } 
      }).exec();
      
      if (!company) {
        company = new this.companyModel({
          bin: `TEMP_${Date.now()}`,
          name: vendorName,
          status: CompanyStatus.PENDING,
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
          registeredAt: new Date(),
        });
        await company.save();
        this.logger.log(`Created new company: ${vendorName}`);
      }
      
      return company;
    } catch (error) {
      this.logger.error(`Failed to find/create company: ${error.message}`);
      return null;
    }
  }

  private async createDocumentRecord(
    file: Express.Multer.File,
    geminiResult: GeminiAuditResult,
    fraudScore: number,
    companyId?: string,
  ): Promise<DocumentRecordDocument> {
    const document = new this.documentModel({
      companyId: companyId || null,
      subsidyId: 'direct_scan',
      type: 'receipt',
      documentUrl: 'memory_upload',
      fileName: file.originalname,
      fileSize: file.size,
      extractedData: {
        vendor: geminiResult.vendor,
        items: geminiResult.items,
        totalAmount: geminiResult.items.reduce((sum, item) => sum + item.price, 0),
      },
      fraudScore: fraudScore,
      verificationStatus: fraudScore > 70 
        ? VerificationStatus.SUSPICIOUS 
        : (fraudScore > 40 ? VerificationStatus.PENDING : VerificationStatus.VERIFIED),
      issues: geminiResult.analysis.risk_flags,
      verifiedAt: new Date(),
    });
    
    return document.save();
  }

  private generateRecommendations(geminiResult: GeminiAuditResult, fraudScore: number): string[] {
    const recommendations: string[] = [];
    
    if (fraudScore > 70) {
      recommendations.push('Требуется немедленная проверка компании');
      recommendations.push('Рекомендуется приостановить выплаты по субсидиям');
      recommendations.push('Направить уведомление в финансовую полицию');
    } else if (fraudScore > 40) {
      recommendations.push('Провести дополнительную проверку документов');
      recommendations.push('Запросить оригиналы счет-фактур');
      recommendations.push('Внести компанию в список повышенного контроля');
    } else if (geminiResult.analysis.stars < 3) {
      recommendations.push('Проверить цены на предмет завышения');
      recommendations.push('Запросить прайс-листы поставщика');
    } else {
      recommendations.push('Документ прошел проверку - можно одобрить');
      recommendations.push('Продолжить стандартный мониторинг');
    }
    
    if (geminiResult.analysis.risk_flags?.length > 0) {
      for (const flag of geminiResult.analysis.risk_flags.slice(0, 2)) {
        recommendations.push(`Внимание: ${flag}`);
      }
    }
    
    return recommendations;
  }

  private async updateCompanyWithReceiptData(
    companyId: string,
    geminiResult: GeminiAuditResult,
    fraudScore: number,
  ): Promise<void> {
    try {
      const company = await this.companyModel.findById(companyId);
      if (!company) return;
      
      const currentScore = company.trustScore?.score || 50;
      const newScore = Math.round((currentScore + geminiResult.analysis.stars * 20) / 2);
      
      let level = 'low';
      if (newScore >= 70) level = 'high';
      else if (newScore >= 40) level = 'medium';
      
      await this.companyModel.findByIdAndUpdate(companyId, {
        $set: {
          'trustScore.score': newScore,
          'trustScore.level': level,
          'trustScore.lastCalculated': new Date(),
          lastAuditDate: new Date(),
        },
        $inc: { totalSubsidiesReceived: geminiResult.items.reduce((sum, i) => sum + i.price, 0) },
      });
      
      this.logger.log(`Updated company ${companyId} trust score to ${newScore}`);
      
    } catch (error) {
      this.logger.error(`Failed to update company: ${error.message}`);
    }
  }

  // ============ ORIGINAL METHODS ============
  
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
      recommendations: this.generateAuditRecommendations(trustScore, companyAnomalies),
    };
  }
  
  private generateAuditRecommendations(trustScore: any, anomalies: any[]): string[] {
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