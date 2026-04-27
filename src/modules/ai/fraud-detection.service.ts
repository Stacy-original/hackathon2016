import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as ss from 'simple-statistics';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { Subsidy, SubsidyDocument } from '../subsidies/schemas/subsidy.schema';
import { TrustLevel, SubsidyStatus } from '../../common/interfaces/user.interface';

// Simple k-means implementation to avoid import issues
class SimpleKMeans {
  static cluster(data: number[][], k: number, maxIterations: number = 100): { clusters: number[]; centroids: number[][] } {
    if (data.length === 0) return { clusters: [], centroids: [] };
    
    // Initialize centroids randomly
    const centroids: number[][] = [];
    const usedIndices = new Set<number>();
    
    for (let i = 0; i < k && i < data.length; i++) {
      let randomIndex;
      do {
        randomIndex = Math.floor(Math.random() * data.length);
      } while (usedIndices.has(randomIndex));
      usedIndices.add(randomIndex);
      centroids.push([...data[randomIndex]]);
    }
    
    let clusters: number[] = new Array(data.length).fill(0);
    let changed = true;
    let iterations = 0;
    
    while (changed && iterations < maxIterations) {
      changed = false;
      
      // Assign points to nearest centroid
      for (let i = 0; i < data.length; i++) {
        let minDist = Infinity;
        let closestCentroid = 0;
        
        for (let j = 0; j < centroids.length; j++) {
          const dist = Math.sqrt(
            data[i].reduce((sum, val, idx) => sum + Math.pow(val - centroids[j][idx], 2), 0)
          );
          if (dist < minDist) {
            minDist = dist;
            closestCentroid = j;
          }
        }
        
        if (clusters[i] !== closestCentroid) {
          clusters[i] = closestCentroid;
          changed = true;
        }
      }
      
      // Update centroids
      for (let j = 0; j < centroids.length; j++) {
        const pointsInCluster = data.filter((_, idx) => clusters[idx] === j);
        if (pointsInCluster.length > 0) {
          const newCentroid = pointsInCluster[0].map((_, dimIdx) =>
            pointsInCluster.reduce((sum, point) => sum + point[dimIdx], 0) / pointsInCluster.length
          );
          centroids[j] = newCentroid;
        }
      }
      
      iterations++;
    }
    
    return { clusters, centroids };
  }
}

@Injectable()
export class FraudDetectionService {
  private readonly logger = new Logger(FraudDetectionService.name);
  
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Subsidy.name) private subsidyModel: Model<SubsidyDocument>,
  ) {}
  
  async detectAnomalies(): Promise<any[]> {
    const anomalies: any[] = [];
    
    const clusterAnomalies = await this.detectSubsidyClusters();
    anomalies.push(...clusterAnomalies);
    
    const statisticalAnomalies = await this.detectStatisticalOutliers();
    anomalies.push(...statisticalAnomalies);
    
    const ratioAnomalies = await this.detectRatioAnomalies();
    anomalies.push(...ratioAnomalies);
    
    return anomalies;
  }
  
  private async detectSubsidyClusters(): Promise<any[]> {
    const companies = await this.companyModel.find().exec();
    const subsidies = await this.subsidyModel.find().exec();
    
    const companySubsidyMap = new Map();
    subsidies.forEach(subsidy => {
      const current = companySubsidyMap.get(subsidy.companyId.toString()) || { totalSubsidy: 0, landArea: 0 };
      current.totalSubsidy += subsidy.amount;
      companySubsidyMap.set(subsidy.companyId.toString(), current);
    });
    
    companies.forEach(company => {
      const data = companySubsidyMap.get(company._id.toString()) || { totalSubsidy: 0, landArea: 0 };
      data.landArea = company.totalLandArea;
      companySubsidyMap.set(company._id.toString(), data);
    });
    
    const vectors: number[][] = [];
    const companyIds: string[] = [];
    
    for (const [companyId, data] of companySubsidyMap.entries()) {
      if (data.landArea > 0) {
        const subsidyPerHectare = data.totalSubsidy / data.landArea;
        vectors.push([subsidyPerHectare, data.landArea]);
        companyIds.push(companyId);
      }
    }
    
    if (vectors.length < 5) return [];
    
    try {
      const k = Math.min(3, Math.floor(vectors.length / 2));
      const result = SimpleKMeans.cluster(vectors, k);
      
      const anomalies: any[] = [];
      result.clusters.forEach((clusterIdx: number, idx: number) => {
        const center = result.centroids[clusterIdx];
        const distance = Math.sqrt(
          Math.pow(vectors[idx][0] - center[0], 2) + 
          Math.pow(vectors[idx][1] - center[1], 2)
        );
        
        if (distance > 2 * ss.standardDeviation(vectors.map(v => v[0]))) {
          anomalies.push({
            companyId: companyIds[idx],
            type: 'subsidy_anomaly',
            severity: 'high',
            description: `Subsidy amount significantly deviates from cluster average`,
            evidence: {
              subsidyPerHectare: vectors[idx][0],
              landArea: vectors[idx][1],
              clusterCenter: center,
              distance: distance,
            },
          });
        }
      });
      
      return anomalies;
    } catch (error) {
      this.logger.error(`Clustering failed: ${error.message}`);
      return [];
    }
  }
  
  private async detectStatisticalOutliers(): Promise<any[]> {
    const companies = await this.companyModel.find().exec();
    const anomalies: any[] = [];
    
    const subsidyAmounts = companies.map(c => c.totalSubsidiesReceived).filter(a => a > 0);
    const yields = companies.map(c => c.reportedYield).filter(y => y > 0);
    
    if (subsidyAmounts.length === 0) return [];
    
    const subsidyStats = {
      mean: ss.mean(subsidyAmounts),
      stdDev: ss.standardDeviation(subsidyAmounts),
      q1: ss.quantile(subsidyAmounts, 0.25),
      q3: ss.quantile(subsidyAmounts, 0.75),
    };
    
    const iqr = subsidyStats.q3 - subsidyStats.q1;
    const upperBound = subsidyStats.q3 + 1.5 * iqr;
    
    for (const company of companies) {
      if (company.totalSubsidiesReceived > upperBound) {
        anomalies.push({
          companyId: company._id.toString(),
          companyName: company.name,
          type: 'subsidy_anomaly',
          severity: 'medium',
          description: `Total subsidies received exceeds normal range`,
          evidence: {
            amount: company.totalSubsidiesReceived,
            upperBound: upperBound,
            percentile: '> 75th percentile + 1.5*IQR',
          },
        });
      }
      
      if (company.totalSubsidiesReceived > 0 && company.reportedYield > 0) {
        const efficiency = company.reportedYield / (company.totalSubsidiesReceived / 1000);
        if (efficiency < 0.1) {
          anomalies.push({
            companyId: company._id.toString(),
            companyName: company.name,
            type: 'yield_anomaly',
            severity: 'high',
            description: `Very low yield relative to subsidies received`,
            evidence: {
              yield: company.reportedYield,
              subsidy: company.totalSubsidiesReceived,
              efficiency: efficiency,
            },
          });
        }
      }
    }
    
    return anomalies;
  }
  
  private async detectRatioAnomalies(): Promise<any[]> {
    const companies = await this.companyModel.find().exec();
    const anomalies: any[] = [];
    
    for (const company of companies) {
      const cultivationRate = company.cultivatedArea / (company.totalLandArea || 1);
      
      if (cultivationRate < 0.3 && company.totalSubsidiesReceived > 1000000) {
        anomalies.push({
          companyId: company._id.toString(),
          companyName: company.name,
          type: 'land_usage_anomaly',
          severity: 'high',
          description: `Very low land cultivation rate despite significant subsidies`,
          evidence: {
            totalLand: company.totalLandArea,
            cultivated: company.cultivatedArea,
            cultivationRate: cultivationRate,
            subsidies: company.totalSubsidiesReceived,
          },
        });
      }
      
      const trustScoreValue = company.trustScore?.score || 50;
      if (trustScoreValue < 30 && company.totalSubsidiesReceived > 5000000) {
        anomalies.push({
          companyId: company._id.toString(),
          companyName: company.name,
          type: 'trust_score_anomaly',
          severity: 'critical',
          description: `Low trust score despite receiving large subsidies`,
          evidence: {
            trustScore: trustScoreValue,
            subsidies: company.totalSubsidiesReceived,
          },
        });
      }
    }
    
    return anomalies;
  }
  
  async calculateTrustScore(companyId: string): Promise<any> {
    const company = await this.companyModel.findById(companyId);
    if (!company) return null;
    
    const subsidies = await this.subsidyModel.find({ companyId }).exec();
    
    let subsidyCompliance = 50;
    let landUsage = 50;
    let anomalyDetection = 50;
    
    const totalRequested = subsidies.reduce((sum, s) => sum + s.amount, 0);
    const totalApproved = subsidies.reduce((sum, s) => sum + (s.approvedArea ? s.approvedArea * 1000 : 0), 0);
    if (totalRequested > 0) {
      subsidyCompliance = Math.min(100, (totalApproved / totalRequested) * 100);
    }
    
    if (company.totalLandArea > 0) {
      landUsage = Math.min(100, (company.cultivatedArea / company.totalLandArea) * 100);
    }
    
    const anomalies = await this.detectAnomalies();
    const companyAnomalies = anomalies.filter(a => a.companyId === companyId);
    if (companyAnomalies.length > 0) {
      anomalyDetection = Math.max(0, 100 - (companyAnomalies.length * 20));
    }
    
    const score = Math.round(
      (subsidyCompliance * 0.35) +
      (landUsage * 0.25) +
      (anomalyDetection * 0.4)
    );
    
    let level: TrustLevel;
    if (score >= 70) level = TrustLevel.HIGH;
    else if (score >= 40) level = TrustLevel.MEDIUM;
    else level = TrustLevel.LOW;
    
    return {
      score: score,
      level: level,
      factors: {
        subsidyCompliance: Math.round(subsidyCompliance),
        landUsage: Math.round(landUsage),
        anomalyDetection: Math.round(anomalyDetection),
      },
      lastCalculated: new Date(),
    };
  }
}