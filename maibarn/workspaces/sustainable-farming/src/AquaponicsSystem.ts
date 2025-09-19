/**
 * Integrated Aquaponics System
 * Sustainable food production combining fish farming with hydroponic plant cultivation
 */

interface FishTank {
  id: string;
  volume: number; // liters
  fishSpecies: string;
  fishCount: number;
  temperature: number; // Celsius
  ph: number;
  dissolvedOxygen: number; // mg/L
  ammonia: number; // ppm
  nitrite: number; // ppm
  nitrate: number; // ppm
}

interface GrowBed {
  id: string;
  area: number; // m²
  depth: number; // cm
  mediaType: 'clay_pebbles' | 'gravel' | 'lava_rock' | 'coconut_coir';
  plantType: string;
  plantCount: number;
  flowRate: number; // liters/hour
}

interface NutrientLevels {
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  calcium: number;
  magnesium: number;
  iron: number;
  ph: number;
  ec: number; // electrical conductivity
}

interface SystemBalance {
  fishBiomass: number; // kg
  plantBiomass: number; // kg
  feedingRate: number; // g/day
  nitrificationRate: number; // efficiency percentage
  waterQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export class AquaponicsSystem {
  private fishTanks: Map<string, FishTank> = new Map();
  private growBeds: Map<string, GrowBed> = new Map();
  private biofilterCapacity: number = 0;
  private systemVolume: number = 0;
  private pumpFlowRate: number = 0;
  private nutrientHistory: NutrientLevels[] = [];

  constructor() {
    this.initializeSystemDefaults();
  }

  private initializeSystemDefaults(): void {
    // Set optimal parameters for common aquaponics setups
    this.biofilterCapacity = 100; // kg of fish supported
    this.pumpFlowRate = 1000; // liters/hour
  }

  /**
   * Calculate optimal fish-to-plant ratio for system balance
   */
  public calculateOptimalRatio(): {
    currentRatio: number;
    optimalRatio: number;
    recommendation: string;
  } {
    const totalFishBiomass = this.calculateTotalFishBiomass();
    const totalPlantArea = this.calculateTotalPlantArea();
    
    const currentRatio = totalPlantArea > 0 ? totalFishBiomass / totalPlantArea : 0;
    
    // Optimal ratio depends on fish species and plant types
    const optimalRatio = this.determineOptimalRatio();
    
    let recommendation = '';
    if (currentRatio < optimalRatio * 0.8) {
      recommendation = `Add ${Math.round((optimalRatio - currentRatio) * totalPlantArea)} kg more fish or reduce plant area`;
    } else if (currentRatio > optimalRatio * 1.2) {
      recommendation = `Add ${Math.round((currentRatio - optimalRatio) * totalPlantArea / optimalRatio)} m² more grow beds`;
    } else {
      recommendation = 'System is well balanced';
    }

    return {
      currentRatio: Math.round(currentRatio * 100) / 100,
      optimalRatio,
      recommendation
    };
  }

  /**
   * Monitor and optimize nitrogen cycle
   */
  public monitorNitrogenCycle(): {
    status: 'healthy' | 'warning' | 'critical';
    ammoniaLevel: number;
    nitriteLevel: number;
    nitrateLevel: number;
    recommendations: string[];
  } {
    let totalAmmonia = 0;
    let totalNitrite = 0;
    let totalNitrate = 0;
    let tankCount = 0;

    for (const tank of this.fishTanks.values()) {
      totalAmmonia += tank.ammonia;
      totalNitrite += tank.nitrite;
      totalNitrate += tank.nitrate;
      tankCount++;
    }

    const avgAmmonia = tankCount > 0 ? totalAmmonia / tankCount : 0;
    const avgNitrite = tankCount > 0 ? totalNitrite / tankCount : 0;
    const avgNitrate = tankCount > 0 ? totalNitrate / tankCount : 0;

    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Check ammonia levels (should be < 0.5 ppm)
    if (avgAmmonia > 1.0) {
      status = 'critical';
      recommendations.push('CRITICAL: High ammonia! Reduce feeding immediately');
      recommendations.push('Increase biofilter capacity or add beneficial bacteria');
    } else if (avgAmmonia > 0.5) {
      status = 'warning';
      recommendations.push('Warning: Ammonia rising, monitor closely');
    }

    // Check nitrite levels (should be < 0.5 ppm)
    if (avgNitrite > 1.0) {
      status = 'critical';
      recommendations.push('CRITICAL: High nitrite! Check biofilter function');
      recommendations.push('Consider adding salt (1-2 g/L) to reduce nitrite toxicity');
    } else if (avgNitrite > 0.5) {
      if (status === 'healthy') status = 'warning';
      recommendations.push('Nitrite elevated, ensure adequate oxygenation');
    }

    // Check nitrate levels (20-60 ppm optimal for plants)
    if (avgNitrate < 20) {
      recommendations.push('Low nitrate: Consider increasing fish feeding rate');
    } else if (avgNitrate > 100) {
      recommendations.push('High nitrate: Add more plants or harvest existing ones');
    }

    if (status === 'healthy') {
      recommendations.push('Nitrogen cycle functioning well');
    }

    return {
      status,
      ammoniaLevel: Math.round(avgAmmonia * 100) / 100,
      nitriteLevel: Math.round(avgNitrite * 100) / 100,
      nitrateLevel: Math.round(avgNitrate * 100) / 100,
      recommendations
    };
  }

  /**
   * AI-powered feeding optimization
   */
  public optimizeFeedingSchedule(): {
    dailyFeedAmount: number;
    feedingTimes: string[];
    feedType: string;
    adjustments: string[];
  } {
    const totalFishBiomass = this.calculateTotalFishBiomass();
    const waterTemp = this.getAverageWaterTemperature();
    const currentNitrogen = this.monitorNitrogenCycle();
    
    // Base feeding rate: 1-3% of fish biomass per day
    let feedingRate = 0.02; // 2% baseline
    
    // Adjust based on water temperature
    if (waterTemp < 20) {
      feedingRate *= 0.7; // Reduce in cold water
    } else if (waterTemp > 28) {
      feedingRate *= 0.8; // Reduce in very warm water
    } else if (waterTemp >= 24 && waterTemp <= 26) {
      feedingRate *= 1.1; // Optimal temperature
    }

    // Adjust based on nitrogen levels
    if (currentNitrogen.ammoniaLevel > 0.5) {
      feedingRate *= 0.5; // Reduce feeding if ammonia high
    } else if (currentNitrogen.nitrateLevel < 20) {
      feedingRate *= 1.2; // Increase if nitrate low
    }

    const dailyFeedAmount = totalFishBiomass * feedingRate * 1000; // Convert to grams

    // Determine feeding times based on fish species
    const feedingTimes = this.determineFeedingTimes();
    const feedType = this.selectOptimalFeedType();

    const adjustments: string[] = [];
    
    if (waterTemp < 20) {
      adjustments.push('Reduced feeding due to low temperature');
    }
    if (currentNitrogen.ammoniaLevel > 0.5) {
      adjustments.push('Reduced feeding to control ammonia');
    }
    if (currentNitrogen.nitrateLevel < 20) {
      adjustments.push('Increased feeding to boost nitrate for plants');
    }

    return {
      dailyFeedAmount: Math.round(dailyFeedAmount),
      feedingTimes,
      feedType,
      adjustments
    };
  }

  /**
   * Plant health monitoring and optimization
   */
  public optimizePlantGrowth(): {
    nutrientStatus: NutrientLevels;
    lightingRecommendation: string;
    pruningSchedule: Map<string, string[]>;
    yieldPrediction: number;
  } {
    const currentNutrients = this.analyzeNutrientLevels();
    const lightingRec = this.calculateLightingNeeds();
    const pruningSchedule = this.generatePruningSchedule();
    const yieldPrediction = this.predictYield();

    return {
      nutrientStatus: currentNutrients,
      lightingRecommendation: lightingRec,
      pruningSchedule,
      yieldPrediction
    };
  }

  /**
   * Water quality management
   */
  public manageWaterQuality(): {
    parameters: {
      temperature: number;
      ph: number;
      dissolvedOxygen: number;
      turbidity: string;
    };
    actions: string[];
    waterChangeNeeded: boolean;
    additives: Map<string, number>;
  } {
    const avgTemp = this.getAverageWaterTemperature();
    const avgPH = this.getAveragePH();
    const avgDO = this.getAverageDO();
    
    const actions: string[] = [];
    const additives = new Map<string, number>();
    let waterChangeNeeded = false;

    // Temperature management
    if (avgTemp < 18) {
      actions.push('Add water heater or insulation');
    } else if (avgTemp > 30) {
      actions.push('Add cooling or shade to reduce temperature');
    }

    // pH management
    if (avgPH < 6.5) {
      actions.push('Add calcium carbonate to raise pH');
      additives.set('calcium_carbonate', this.calculatePHAdjustment(avgPH, 7.0));
    } else if (avgPH > 7.5) {
      actions.push('Add phosphoric acid to lower pH');
      additives.set('phosphoric_acid', this.calculatePHAdjustment(avgPH, 7.0));
    }

    // Dissolved oxygen management
    if (avgDO < 5) {
      actions.push('URGENT: Increase aeration immediately');
      actions.push('Check pump function and add air stones');
    } else if (avgDO < 6) {
      actions.push('Consider adding supplemental aeration');
    }

    // Check if water change needed
    const nitrogen = this.monitorNitrogenCycle();
    if (nitrogen.nitrateLevel > 150 || nitrogen.status === 'critical') {
      waterChangeNeeded = true;
      actions.push('Perform 20-30% water change');
    }

    return {
      parameters: {
        temperature: Math.round(avgTemp * 10) / 10,
        ph: Math.round(avgPH * 10) / 10,
        dissolvedOxygen: Math.round(avgDO * 10) / 10,
        turbidity: this.assessTurbidity()
      },
      actions,
      waterChangeNeeded,
      additives
    };
  }

  /**
   * Energy efficiency optimization
   */
  public optimizeEnergyUsage(): {
    currentUsage: number; // kWh per day
    optimizedUsage: number;
    savings: number;
    recommendations: string[];
  } {
    const pumpEnergy = this.calculatePumpEnergy();
    const lightingEnergy = this.calculateLightingEnergy();
    const heatingCoolingEnergy = this.calculateClimateControlEnergy();
    
    const currentUsage = pumpEnergy + lightingEnergy + heatingCoolingEnergy;
    
    const recommendations: string[] = [];
    let optimizedUsage = currentUsage;

    // Pump optimization
    if (this.pumpFlowRate > this.calculateRequiredFlowRate() * 1.5) {
      const savings = pumpEnergy * 0.3;
      optimizedUsage -= savings;
      recommendations.push(`Reduce pump flow rate to save ${Math.round(savings)} kWh/day`);
    }

    // Lighting optimization
    if (lightingEnergy > 0) {
      recommendations.push('Switch to LED grow lights for 40% energy savings');
      recommendations.push('Implement photoperiod control (16h light/8h dark)');
      optimizedUsage -= lightingEnergy * 0.4;
    }

    // Temperature optimization
    if (heatingCoolingEnergy > 0) {
      recommendations.push('Add insulation to reduce heating/cooling by 25%');
      recommendations.push('Use thermal mass (water barrels) for temperature stability');
      optimizedUsage -= heatingCoolingEnergy * 0.25;
    }

    // Solar integration
    recommendations.push('Consider solar panels for pump operation (ROI: 3-4 years)');

    return {
      currentUsage: Math.round(currentUsage * 10) / 10,
      optimizedUsage: Math.round(optimizedUsage * 10) / 10,
      savings: Math.round((currentUsage - optimizedUsage) * 10) / 10,
      recommendations
    };
  }

  /**
   * Harvest planning and scheduling
   */
  public planHarvest(): {
    fishHarvest: {
      readyTanks: string[];
      estimatedYield: number;
      optimalDate: Date;
    };
    plantHarvest: {
      readyBeds: string[];
      crops: Map<string, number>;
      harvestWindow: { start: Date; end: Date };
    };
    marketValue: number;
  } {
    const readyFishTanks: string[] = [];
    let fishYield = 0;

    // Check fish readiness
    for (const [tankId, tank] of this.fishTanks) {
      const avgWeight = this.estimateFishWeight(tank);
      if (avgWeight >= this.getMarketWeight(tank.fishSpecies)) {
        readyFishTanks.push(tankId);
        fishYield += avgWeight * tank.fishCount;
      }
    }

    // Check plant readiness
    const readyGrowBeds: string[] = [];
    const cropYields = new Map<string, number>();

    for (const [bedId, bed] of this.growBeds) {
      if (this.isPlantReady(bed)) {
        readyGrowBeds.push(bedId);
        const yield_ = this.estimatePlantYield(bed);
        cropYields.set(bed.plantType, (cropYields.get(bed.plantType) || 0) + yield_);
      }
    }

    // Calculate market value
    const fishValue = fishYield * 8; // $8/kg average
    const plantValue = Array.from(cropYields.entries())
      .reduce((sum, [crop, yield_]) => sum + (yield_ * this.getCropPrice(crop)), 0);

    return {
      fishHarvest: {
        readyTanks: readyFishTanks,
        estimatedYield: Math.round(fishYield * 10) / 10,
        optimalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week
      },
      plantHarvest: {
        readyBeds: readyGrowBeds,
        crops: cropYields,
        harvestWindow: {
          start: new Date(),
          end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 2 weeks
        }
      },
      marketValue: Math.round(fishValue + plantValue)
    };
  }

  // Helper methods
  private calculateTotalFishBiomass(): number {
    let totalBiomass = 0;
    for (const tank of this.fishTanks.values()) {
      const avgWeight = this.estimateFishWeight(tank);
      totalBiomass += avgWeight * tank.fishCount;
    }
    return totalBiomass;
  }

  private calculateTotalPlantArea(): number {
    let totalArea = 0;
    for (const bed of this.growBeds.values()) {
      totalArea += bed.area;
    }
    return totalArea;
  }

  private determineOptimalRatio(): number {
    // Rule of thumb: 60-100g of fish feed per m² of grow bed per day
    // Assuming 2% feeding rate, this translates to 3-5 kg fish per m² grow bed
    return 4; // kg fish per m² grow bed
  }

  private getAverageWaterTemperature(): number {
    if (this.fishTanks.size === 0) return 22; // Default
    
    let totalTemp = 0;
    for (const tank of this.fishTanks.values()) {
      totalTemp += tank.temperature;
    }
    return totalTemp / this.fishTanks.size;
  }

  private getAveragePH(): number {
    if (this.fishTanks.size === 0) return 7.0; // Default
    
    let totalPH = 0;
    for (const tank of this.fishTanks.values()) {
      totalPH += tank.ph;
    }
    return totalPH / this.fishTanks.size;
  }

  private getAverageDO(): number {
    if (this.fishTanks.size === 0) return 7.0; // Default
    
    let totalDO = 0;
    for (const tank of this.fishTanks.values()) {
      totalDO += tank.dissolvedOxygen;
    }
    return totalDO / this.fishTanks.size;
  }

  private determineFeedingTimes(): string[] {
    // Optimal feeding times for most fish
    return ['08:00', '12:00', '17:00'];
  }

  private selectOptimalFeedType(): string {
    // Select based on fish species and growth stage
    return '32% protein pellets (2-4mm)';
  }

  private analyzeNutrientLevels(): NutrientLevels {
    // Analyze current nutrient levels from nitrogen cycle
    const nitrogen = this.monitorNitrogenCycle();
    
    return {
      nitrogen: nitrogen.nitrateLevel,
      phosphorus: 2.5, // Typical from fish waste
      potassium: 15, // Lower in aquaponics
      calcium: 40,
      magnesium: 25,
      iron: 2,
      ph: this.getAveragePH(),
      ec: 1.4 // Typical for aquaponics
    };
  }

  private calculateLightingNeeds(): string {
    // Calculate based on plant types
    return 'Provide 14-16 hours of light at 200-400 μmol/m²/s for leafy greens';
  }

  private generatePruningSchedule(): Map<string, string[]> {
    const schedule = new Map<string, string[]>();
    
    for (const [bedId, bed] of this.growBeds) {
      const tasks: string[] = [];
      
      if (bed.plantType === 'tomato') {
        tasks.push('Remove suckers weekly');
        tasks.push('Prune lower leaves after fruit set');
      } else if (bed.plantType === 'lettuce') {
        tasks.push('Harvest outer leaves continuously');
      }
      
      schedule.set(bedId, tasks);
    }
    
    return schedule;
  }

  private predictYield(): number {
    // Predict based on current growth conditions
    let totalYield = 0;
    
    for (const bed of this.growBeds.values()) {
      totalYield += this.estimatePlantYield(bed);
    }
    
    return Math.round(totalYield * 10) / 10;
  }

  private calculatePHAdjustment(currentPH: number, targetPH: number): number {
    // Calculate amount of adjustment needed (in grams per 1000L)
    const difference = Math.abs(currentPH - targetPH);
    return Math.round(difference * this.systemVolume * 0.1); // Simplified calculation
  }

  private assessTurbidity(): string {
    // Assess water clarity
    return 'Clear'; // Would use turbidity sensor in real system
  }

  private calculatePumpEnergy(): number {
    // kWh per day for water pumping
    const watts = this.pumpFlowRate * 0.5; // Approximate watts based on flow
    return (watts * 24) / 1000;
  }

  private calculateLightingEnergy(): number {
    // kWh per day for grow lights
    const lightsPerBed = 200; // Watts per m²
    let totalArea = 0;
    
    for (const bed of this.growBeds.values()) {
      totalArea += bed.area;
    }
    
    return (totalArea * lightsPerBed * 16) / 1000; // 16 hours photoperiod
  }

  private calculateClimateControlEnergy(): number {
    // kWh per day for heating/cooling
    const temp = this.getAverageWaterTemperature();
    
    if (temp < 20 || temp > 28) {
      return 10; // Approximate energy for temperature control
    }
    
    return 0;
  }

  private calculateRequiredFlowRate(): number {
    // Minimum flow rate needed
    return this.systemVolume * 1.5; // 1.5 turnovers per hour
  }

  private estimateFishWeight(tank: FishTank): number {
    // Estimate average fish weight based on species and conditions
    const baseWeights: { [key: string]: number } = {
      'tilapia': 0.5,
      'catfish': 0.7,
      'trout': 0.4,
      'perch': 0.3
    };
    
    return baseWeights[tank.fishSpecies] || 0.5;
  }

  private getMarketWeight(species: string): number {
    // Market-ready weight for different species
    const marketWeights: { [key: string]: number } = {
      'tilapia': 0.5,
      'catfish': 0.7,
      'trout': 0.4,
      'perch': 0.3
    };
    
    return marketWeights[species] || 0.5;
  }

  private isPlantReady(bed: GrowBed): boolean {
    // Check if plants are ready for harvest
    // Simplified - would check actual growth stage in real system
    return true;
  }

  private estimatePlantYield(bed: GrowBed): number {
    // Estimate yield based on plant type and area
    const yieldsPerM2: { [key: string]: number } = {
      'lettuce': 4,
      'tomato': 8,
      'basil': 2,
      'cucumber': 6
    };
    
    const yieldPerM2 = yieldsPerM2[bed.plantType] || 3;
    return bed.area * yieldPerM2;
  }

  private getCropPrice(crop: string): number {
    // Market price per kg
    const prices: { [key: string]: number } = {
      'lettuce': 4,
      'tomato': 3,
      'basil': 12,
      'cucumber': 2.5
    };
    
    return prices[crop] || 3;
  }

  // Public methods for system management
  public addFishTank(tank: FishTank): void {
    this.fishTanks.set(tank.id, tank);
    this.systemVolume += tank.volume;
  }

  public addGrowBed(bed: GrowBed): void {
    this.growBeds.set(bed.id, bed);
  }

  public updateWaterParameters(tankId: string, params: Partial<FishTank>): void {
    const tank = this.fishTanks.get(tankId);
    if (tank) {
      Object.assign(tank, params);
    }
  }

  public recordNutrientLevels(levels: NutrientLevels): void {
    this.nutrientHistory.push(levels);
    
    // Keep only last 30 days
    if (this.nutrientHistory.length > 30) {
      this.nutrientHistory.shift();
    }
  }
}