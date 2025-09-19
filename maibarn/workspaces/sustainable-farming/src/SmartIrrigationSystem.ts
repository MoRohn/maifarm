/**
 * Smart Irrigation System for Sustainable Farming
 * AI-powered water optimization based on multiple environmental factors
 */

interface SoilMoistureData {
  sensorId: string;
  depth: number; // cm
  moisture: number; // percentage
  temperature: number; // Celsius
  timestamp: Date;
}

interface WeatherPrediction {
  date: Date;
  precipitation: number; // mm
  humidity: number; // percentage
  temperature: {
    min: number;
    max: number;
  };
  evapotranspiration: number; // mm/day
}

interface CropWaterRequirement {
  cropType: string;
  growthStage: 'germination' | 'vegetative' | 'flowering' | 'fruiting' | 'maturity';
  dailyWaterNeed: number; // liters per m²
  criticalMoistureLevel: number; // percentage
}

interface IrrigationZone {
  id: string;
  area: number; // m²
  cropType: string;
  soilType: 'clay' | 'sandy' | 'loam' | 'silt';
  sensors: string[];
  valveId: string;
  flowRate: number; // liters per minute
}

export class SmartIrrigationSystem {
  private zones: Map<string, IrrigationZone> = new Map();
  private soilData: Map<string, SoilMoistureData[]> = new Map();
  private cropRequirements: Map<string, CropWaterRequirement> = new Map();
  private weatherCache: WeatherPrediction[] = [];
  private waterUsageHistory: number[] = [];

  constructor() {
    this.initializeCropDatabase();
  }

  private initializeCropDatabase(): void {
    // Initialize with common crop water requirements
    this.cropRequirements.set('tomato', {
      cropType: 'tomato',
      growthStage: 'vegetative',
      dailyWaterNeed: 4.5,
      criticalMoistureLevel: 65
    });

    this.cropRequirements.set('corn', {
      cropType: 'corn',
      growthStage: 'vegetative',
      dailyWaterNeed: 5.0,
      criticalMoistureLevel: 70
    });

    this.cropRequirements.set('wheat', {
      cropType: 'wheat',
      growthStage: 'vegetative',
      dailyWaterNeed: 3.5,
      criticalMoistureLevel: 60
    });

    this.cropRequirements.set('lettuce', {
      cropType: 'lettuce',
      growthStage: 'vegetative',
      dailyWaterNeed: 3.0,
      criticalMoistureLevel: 75
    });
  }

  /**
   * AI-powered irrigation decision making
   */
  public calculateOptimalIrrigation(zoneId: string): {
    shouldIrrigate: boolean;
    waterAmount: number;
    duration: number;
    reason: string;
  } {
    const zone = this.zones.get(zoneId);
    if (!zone) {
      throw new Error(`Zone ${zoneId} not found`);
    }

    const currentMoisture = this.getCurrentMoisture(zone);
    const cropReq = this.cropRequirements.get(zone.cropType);
    const weatherForecast = this.getWeatherForecast(7); // 7 day forecast
    
    // AI decision factors
    const factors = {
      currentMoisture,
      criticalLevel: cropReq?.criticalMoistureLevel || 60,
      predictedRainfall: this.calculatePredictedRainfall(weatherForecast),
      evapotranspiration: this.calculateEvapotranspiration(weatherForecast),
      soilRetention: this.getSoilRetentionFactor(zone.soilType),
      cropStage: cropReq?.growthStage || 'vegetative'
    };

    // Decision algorithm
    const moistureDeficit = factors.criticalLevel - factors.currentMoisture;
    const needsWater = moistureDeficit > 5; // 5% buffer
    
    if (!needsWater && factors.predictedRainfall > 10) {
      return {
        shouldIrrigate: false,
        waterAmount: 0,
        duration: 0,
        reason: `Sufficient moisture (${factors.currentMoisture}%) and rain predicted (${factors.predictedRainfall}mm)`
      };
    }

    // Calculate optimal water amount
    const waterAmount = this.calculateWaterAmount(
      zone,
      moistureDeficit,
      factors.evapotranspiration,
      factors.soilRetention
    );

    const duration = Math.ceil(waterAmount / zone.flowRate);

    return {
      shouldIrrigate: needsWater,
      waterAmount,
      duration,
      reason: this.generateIrrigationReason(factors, needsWater)
    };
  }

  /**
   * Machine Learning prediction model for water needs
   */
  public predictWaterNeeds(days: number): Map<string, number[]> {
    const predictions = new Map<string, number[]>();

    for (const [zoneId, zone] of this.zones) {
      const dailyPredictions: number[] = [];
      const historicalData = this.soilData.get(zoneId) || [];
      
      for (let day = 0; day < days; day++) {
        // Simple ML model using historical patterns
        const baseNeed = this.cropRequirements.get(zone.cropType)?.dailyWaterNeed || 4;
        const weatherAdjustment = this.getWeatherAdjustment(day);
        const historicalPattern = this.analyzeHistoricalPattern(historicalData, day);
        
        const predictedNeed = baseNeed * weatherAdjustment * historicalPattern * zone.area;
        dailyPredictions.push(Math.round(predictedNeed * 10) / 10);
      }

      predictions.set(zoneId, dailyPredictions);
    }

    return predictions;
  }

  /**
   * Water conservation optimizer
   */
  public optimizeWaterUsage(): {
    totalSaved: number;
    recommendations: string[];
  } {
    let totalSaved = 0;
    const recommendations: string[] = [];

    // Analyze each zone for optimization opportunities
    for (const [zoneId, zone] of this.zones) {
      const moisture = this.getCurrentMoisture(zone);
      const cropReq = this.cropRequirements.get(zone.cropType);

      // Check for over-watering
      if (moisture > (cropReq?.criticalMoistureLevel || 70) + 10) {
        const reduction = (moisture - cropReq!.criticalMoistureLevel) * zone.area * 0.1;
        totalSaved += reduction;
        recommendations.push(
          `Zone ${zoneId}: Reduce irrigation by ${Math.round(reduction)}L (currently over-watered)`
        );
      }

      // Suggest drip irrigation for water-intensive crops
      if (cropReq && cropReq.dailyWaterNeed > 4) {
        recommendations.push(
          `Zone ${zoneId}: Consider drip irrigation for ${zone.cropType} to save ~30% water`
        );
      }

      // Mulching recommendation for high evaporation areas
      const evapRate = this.calculateEvapotranspiration(this.weatherCache);
      if (evapRate > 5) {
        recommendations.push(
          `Zone ${zoneId}: Apply mulch to reduce evaporation (potential 20% water savings)`
        );
      }
    }

    // Time-of-day optimization
    recommendations.push('Schedule irrigation for early morning (4-6 AM) to minimize evaporation loss');

    return { totalSaved, recommendations };
  }

  /**
   * Real-time monitoring and alerts
   */
  public monitorSystem(): {
    status: 'optimal' | 'warning' | 'critical';
    alerts: string[];
    metrics: {
      averageMoisture: number;
      waterUsedToday: number;
      efficiency: number;
    };
  } {
    const alerts: string[] = [];
    let totalMoisture = 0;
    let zoneCount = 0;

    for (const [zoneId, zone] of this.zones) {
      const moisture = this.getCurrentMoisture(zone);
      const cropReq = this.cropRequirements.get(zone.cropType);

      totalMoisture += moisture;
      zoneCount++;

      // Check critical levels
      if (moisture < (cropReq?.criticalMoistureLevel || 60) - 10) {
        alerts.push(`CRITICAL: Zone ${zoneId} moisture at ${moisture}% (below critical level)`);
      } else if (moisture < (cropReq?.criticalMoistureLevel || 60)) {
        alerts.push(`Warning: Zone ${zoneId} moisture at ${moisture}% (approaching critical level)`);
      }

      // Check for sensor failures
      const sensorData = this.soilData.get(zoneId);
      if (!sensorData || sensorData.length === 0) {
        alerts.push(`Sensor failure in Zone ${zoneId}`);
      }
    }

    const averageMoisture = totalMoisture / zoneCount;
    const waterUsedToday = this.calculateTodayWaterUsage();
    const efficiency = this.calculateIrrigationEfficiency();

    let status: 'optimal' | 'warning' | 'critical' = 'optimal';
    if (alerts.some(a => a.includes('CRITICAL'))) {
      status = 'critical';
    } else if (alerts.length > 0) {
      status = 'warning';
    }

    return {
      status,
      alerts,
      metrics: {
        averageMoisture: Math.round(averageMoisture * 10) / 10,
        waterUsedToday,
        efficiency: Math.round(efficiency * 100) / 100
      }
    };
  }

  // Helper methods
  private getCurrentMoisture(zone: IrrigationZone): number {
    const sensorData = this.soilData.get(zone.id) || [];
    if (sensorData.length === 0) return 50; // Default

    const recentData = sensorData.slice(-zone.sensors.length);
    const avgMoisture = recentData.reduce((sum, data) => sum + data.moisture, 0) / recentData.length;
    
    return Math.round(avgMoisture * 10) / 10;
  }

  private getWeatherForecast(days: number): WeatherPrediction[] {
    // In production, this would fetch from weather API
    return this.weatherCache.slice(0, days);
  }

  private calculatePredictedRainfall(forecast: WeatherPrediction[]): number {
    return forecast.reduce((sum, day) => sum + day.precipitation, 0);
  }

  private calculateEvapotranspiration(forecast: WeatherPrediction[]): number {
    if (forecast.length === 0) return 4; // Default ET rate
    
    const avgET = forecast.reduce((sum, day) => sum + day.evapotranspiration, 0) / forecast.length;
    return Math.round(avgET * 10) / 10;
  }

  private getSoilRetentionFactor(soilType: string): number {
    const retentionFactors = {
      clay: 0.9,    // High water retention
      loam: 0.7,    // Moderate retention
      silt: 0.6,    // Moderate-low retention
      sandy: 0.4    // Low retention
    };
    return retentionFactors[soilType as keyof typeof retentionFactors] || 0.6;
  }

  private calculateWaterAmount(
    zone: IrrigationZone,
    moistureDeficit: number,
    evapotranspiration: number,
    soilRetention: number
  ): number {
    const baseAmount = zone.area * moistureDeficit * 0.1; // Basic calculation
    const etAdjustment = evapotranspiration * zone.area;
    const soilAdjustment = 1 / soilRetention; // More water needed for low retention soils
    
    return Math.round((baseAmount + etAdjustment) * soilAdjustment);
  }

  private generateIrrigationReason(factors: any, needsWater: boolean): string {
    if (!needsWater) {
      return `Adequate moisture level (${factors.currentMoisture}%)`;
    }

    const reasons = [];
    if (factors.currentMoisture < factors.criticalLevel - 10) {
      reasons.push(`critical moisture deficit`);
    } else {
      reasons.push(`approaching critical moisture level`);
    }

    if (factors.predictedRainfall < 5) {
      reasons.push(`minimal rainfall predicted`);
    }

    if (factors.evapotranspiration > 5) {
      reasons.push(`high evapotranspiration rate`);
    }

    return `Irrigation needed: ${reasons.join(', ')}`;
  }

  private getWeatherAdjustment(dayOffset: number): number {
    // Simplified weather adjustment factor
    const forecast = this.weatherCache[dayOffset];
    if (!forecast) return 1;

    let adjustment = 1;
    if (forecast.temperature.max > 30) adjustment *= 1.2; // Hot weather
    if (forecast.humidity < 40) adjustment *= 1.1; // Low humidity
    if (forecast.precipitation > 5) adjustment *= 0.7; // Rain expected

    return adjustment;
  }

  private analyzeHistoricalPattern(data: SoilMoistureData[], dayOffset: number): number {
    // Simple pattern analysis based on historical data
    if (data.length < 7) return 1; // Not enough data

    // Calculate average moisture drop rate
    const weekAgoData = data.slice(-7 - dayOffset, -dayOffset || undefined);
    if (weekAgoData.length < 2) return 1;

    const moistureDropRate = (weekAgoData[0].moisture - weekAgoData[weekAgoData.length - 1].moisture) / weekAgoData.length;
    
    return 1 + (moistureDropRate / 100); // Convert to multiplier
  }

  private calculateTodayWaterUsage(): number {
    // Sum today's water usage
    const today = new Date().toDateString();
    return this.waterUsageHistory.reduce((sum, usage) => sum + usage, 0);
  }

  private calculateIrrigationEfficiency(): number {
    // Calculate efficiency as ratio of water used vs crop needs
    let totalNeeded = 0;
    let totalUsed = 0;

    for (const [zoneId, zone] of this.zones) {
      const cropReq = this.cropRequirements.get(zone.cropType);
      if (cropReq) {
        totalNeeded += cropReq.dailyWaterNeed * zone.area;
      }
    }

    totalUsed = this.calculateTodayWaterUsage();

    if (totalNeeded === 0) return 100;
    
    const efficiency = (totalNeeded / totalUsed) * 100;
    return Math.min(100, efficiency); // Cap at 100%
  }

  // Public methods for zone management
  public addZone(zone: IrrigationZone): void {
    this.zones.set(zone.id, zone);
  }

  public updateSoilData(zoneId: string, data: SoilMoistureData): void {
    if (!this.soilData.has(zoneId)) {
      this.soilData.set(zoneId, []);
    }
    
    const zoneData = this.soilData.get(zoneId)!;
    zoneData.push(data);
    
    // Keep only last 30 days of data
    if (zoneData.length > 30 * 24) { // Assuming hourly readings
      zoneData.shift();
    }
  }

  public updateWeatherForecast(forecast: WeatherPrediction[]): void {
    this.weatherCache = forecast;
  }

  public recordWaterUsage(amount: number): void {
    this.waterUsageHistory.push(amount);
    
    // Keep only last 30 days
    if (this.waterUsageHistory.length > 30) {
      this.waterUsageHistory.shift();
    }
  }
}