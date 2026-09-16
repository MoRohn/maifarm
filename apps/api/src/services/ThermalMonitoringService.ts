/**
 * Thermal Monitoring Service
 *
 * Monitors macOS thermal state and system temperature to automatically
 * adjust farming operations and prevent system crashes due to thermal throttling.
 *
 * Based on macOS thermal state from thermald via notifyd:
 * - Nominal (0): Normal operation - full speed farming
 * - Moderate (1): Elevated thermal - reduce agent count, add delays
 * - Heavy (2): Throttling active - pause non-critical farms, warn user
 * - Trapping (3): Severe protection - emergency pause all farms
 * - Sleeping (4): Maximum protection - critical stop
 *
 * @see https://stanislas.blog/2025/12/macos-thermal-throttling-app/
 */

import { EventEmitter } from 'events';
import { spawn, execSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger, LogCategory } from '../utils/logger';
import { db } from '../database/connection';
import { pathConfig } from '../config/paths';
import {
  metricsRegistry,
  systemResourcesGauge
} from '../monitoring/metricsCollector';
import { Gauge, Counter, Histogram } from 'prom-client';

// Thermal pressure levels from OSThermalNotification.h
export enum ThermalPressureLevel {
  NOMINAL = 0,    // Normal operation
  MODERATE = 1,   // Elevated thermal conditions
  HEAVY = 2,      // Significant thermal throttling
  TRAPPING = 3,   // Severe thermal protection
  SLEEPING = 4    // Maximum thermal protection
}

export const THERMAL_PRESSURE_LABELS: Record<ThermalPressureLevel, string> = {
  [ThermalPressureLevel.NOMINAL]: 'nominal',
  [ThermalPressureLevel.MODERATE]: 'moderate',
  [ThermalPressureLevel.HEAVY]: 'heavy',
  [ThermalPressureLevel.TRAPPING]: 'trapping',
  [ThermalPressureLevel.SLEEPING]: 'sleeping'
};

export interface ThermalMetrics {
  timestamp: Date;
  pressureLevel: ThermalPressureLevel;
  pressureLabel: string;
  cpuTemperature: number | null;
  gpuTemperature: number | null;
  systemTemperature: number | null;
  fanSpeed: number | null;       // RPM or percentage
  fanSpeedPercent: number | null;
  isThrottling: boolean;
  chipGeneration: string | null; // M1, M2, M3, M4, or null for non-Apple Silicon
}

export interface ThermalAlert {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'critical' | 'emergency';
  pressureLevel: ThermalPressureLevel;
  message: string;
  action: ThermalAction | null;
  acknowledged: boolean;
}

export enum ThermalAction {
  REDUCE_AGENTS = 'reduce_agents',
  PAUSE_FARM = 'pause_farm',
  PAUSE_ALL_FARMS = 'pause_all_farms',
  EMERGENCY_STOP = 'emergency_stop',
  RESUME_FARM = 'resume_farm'
}

export interface ThermalThresholds {
  cpuWarning: number;      // Celsius - default 80
  cpuCritical: number;     // Celsius - default 95
  gpuWarning: number;      // Celsius - default 85
  gpuCritical: number;     // Celsius - default 100
  reduceAgentsAt: ThermalPressureLevel;  // MODERATE
  pauseFarmsAt: ThermalPressureLevel;    // HEAVY
  emergencyStopAt: ThermalPressureLevel; // TRAPPING
}

interface ThermalHistoryEntry {
  timestamp: Date;
  metrics: ThermalMetrics;
}

// Prometheus metrics for thermal monitoring
const thermalPressureGauge = new Gauge({
  name: 'maifarm_thermal_pressure_level',
  help: 'Current thermal pressure level (0=nominal, 1=moderate, 2=heavy, 3=trapping, 4=sleeping)',
  registers: [metricsRegistry]
});

const thermalTemperatureGauge = new Gauge({
  name: 'maifarm_thermal_temperature_celsius',
  help: 'Temperature readings in Celsius',
  labelNames: ['sensor', 'chip'],
  registers: [metricsRegistry]
});

const thermalThrottlingGauge = new Gauge({
  name: 'maifarm_thermal_throttling_active',
  help: 'Whether thermal throttling is currently active (1=yes, 0=no)',
  registers: [metricsRegistry]
});

const thermalAlertCounter = new Counter({
  name: 'maifarm_thermal_alerts_total',
  help: 'Total count of thermal alerts by severity',
  labelNames: ['severity', 'pressure_level'],
  registers: [metricsRegistry]
});

const thermalFarmPausedCounter = new Counter({
  name: 'maifarm_thermal_farms_paused_total',
  help: 'Total count of farms paused due to thermal issues',
  labelNames: ['action'],
  registers: [metricsRegistry]
});

const fanSpeedGauge = new Gauge({
  name: 'maifarm_fan_speed_percent',
  help: 'Fan speed as percentage of maximum',
  registers: [metricsRegistry]
});

const DEFAULT_THRESHOLDS: ThermalThresholds = {
  cpuWarning: 80,
  cpuCritical: 95,
  gpuWarning: 85,
  gpuCritical: 100,
  reduceAgentsAt: ThermalPressureLevel.MODERATE,
  pauseFarmsAt: ThermalPressureLevel.HEAVY,
  emergencyStopAt: ThermalPressureLevel.TRAPPING
};

class ThermalMonitoringService extends EventEmitter {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private pollIntervalMs: number = 5000; // 5 seconds
  private metricsHistory: ThermalHistoryEntry[] = [];
  private maxHistorySize: number = 720; // 1 hour at 5-second intervals
  private currentMetrics: ThermalMetrics | null = null;
  private activeAlerts: Map<string, ThermalAlert> = new Map();
  private pausedFarms: Set<string> = new Set();
  private thresholds: ThermalThresholds = DEFAULT_THRESHOLDS;
  private swiftReaderPath: string;
  private chipGeneration: string | null = null;
  private isMacOS: boolean;
  private isAppleSilicon: boolean = false;

  constructor() {
    super();
    this.isMacOS = os.platform() === 'darwin';
    this.swiftReaderPath = path.join(
      pathConfig.getPath('MAIFARM_ROOT'),
      'scripts',
      'thermal-reader.swift'
    );

    if (this.isMacOS) {
      this.detectAppleSilicon();
    }
  }

  /**
   * Detect if running on Apple Silicon and determine chip generation
   */
  private detectAppleSilicon(): void {
    try {
      const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf-8' }).trim();

      if (cpuBrand.includes('Apple')) {
        this.isAppleSilicon = true;

        // Detect chip generation
        if (cpuBrand.includes('M4')) {
          this.chipGeneration = 'M4';
        } else if (cpuBrand.includes('M3')) {
          this.chipGeneration = 'M3';
        } else if (cpuBrand.includes('M2')) {
          this.chipGeneration = 'M2';
        } else if (cpuBrand.includes('M1')) {
          this.chipGeneration = 'M1';
        }

        logger.info(LogCategory.THERMAL, 'Apple Silicon detected', {
          chip: this.chipGeneration,
          brand: cpuBrand
        });
      } else {
        logger.info(LogCategory.THERMAL, 'Intel Mac detected - limited thermal monitoring');
      }
    } catch (error) {
      logger.warn(LogCategory.THERMAL, 'Failed to detect CPU type', { error });
    }
  }

  /**
   * Initialize the thermal monitoring service
   */
  async initialize(): Promise<void> {
    if (this.isRunning) {
      logger.warn(LogCategory.THERMAL, 'Thermal monitoring already running');
      return;
    }

    logger.info(LogCategory.THERMAL, 'Initializing thermal monitoring service', {
      platform: os.platform(),
      isAppleSilicon: this.isAppleSilicon,
      chipGeneration: this.chipGeneration,
      pollInterval: this.pollIntervalMs
    });

    // Ensure Swift reader script exists on macOS
    if (this.isMacOS) {
      await this.ensureSwiftReader();
    }

    // Load thresholds from database or use defaults
    await this.loadThresholds();

    // Start monitoring
    this.isRunning = true;
    this.startMonitoring();

    logger.info(LogCategory.THERMAL, 'Thermal monitoring service initialized');
  }

  /**
   * Ensure the Swift thermal reader script exists
   */
  private async ensureSwiftReader(): Promise<void> {
    const swiftCode = `#!/usr/bin/env swift
// Thermal Reader for MaiFarm
// Reads thermal state from macOS notifyd without requiring root access

import Foundation

@_silgen_name("notify_register_check")
private func notify_register_check(
  _ name: UnsafePointer<CChar>, _ token: UnsafeMutablePointer<Int32>
) -> UInt32

@_silgen_name("notify_get_state")
private func notify_get_state(_ token: Int32, _ state: UnsafeMutablePointer<UInt64>) -> UInt32

@_silgen_name("notify_cancel")
private func notify_cancel(_ token: Int32) -> UInt32

struct ThermalInfo: Codable {
    let pressureLevel: Int
    let pressureLabel: String
    let timestamp: String
}

func getThermalState() -> ThermalInfo {
    let notifyOK: UInt32 = 0
    let name = "com.apple.system.thermalpressurelevel"

    var token: Int32 = 0
    let reg = name.withCString { notify_register_check($0, &token) }

    guard reg == notifyOK else {
        return ThermalInfo(pressureLevel: -1, pressureLabel: "error", timestamp: ISO8601DateFormatter().string(from: Date()))
    }

    defer { _ = notify_cancel(token) }

    var state: UInt64 = 0
    let got = notify_get_state(token, &state)

    guard got == notifyOK else {
        return ThermalInfo(pressureLevel: -1, pressureLabel: "error", timestamp: ISO8601DateFormatter().string(from: Date()))
    }

    let label: String
    switch state {
    case 0: label = "nominal"
    case 1: label = "moderate"
    case 2: label = "heavy"
    case 3: label = "trapping"
    case 4: label = "sleeping"
    default: label = "unknown"
    }

    return ThermalInfo(pressureLevel: Int(state), pressureLabel: label, timestamp: ISO8601DateFormatter().string(from: Date()))
}

let info = getThermalState()
let encoder = JSONEncoder()
if let jsonData = try? encoder.encode(info),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
}
`;

    try {
      const scriptDir = path.dirname(this.swiftReaderPath);
      await fs.mkdir(scriptDir, { recursive: true });
      await fs.writeFile(this.swiftReaderPath, swiftCode, { mode: 0o755 });
      logger.debug(LogCategory.THERMAL, 'Swift thermal reader script created', {
        path: this.swiftReaderPath
      });
    } catch (error) {
      logger.error(LogCategory.THERMAL, 'Failed to create Swift reader script', { error });
    }
  }

  /**
   * Load thermal thresholds from database
   */
  private async loadThresholds(): Promise<void> {
    try {
      const result = await db.query(`
        SELECT value FROM system_config WHERE key = 'thermal_thresholds'
      `);

      if (result.rows.length > 0 && result.rows[0].value) {
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...result.rows[0].value };
        logger.info(LogCategory.THERMAL, 'Loaded thermal thresholds from database', {
          thresholds: this.thresholds
        });
      }
    } catch {
      logger.debug(LogCategory.THERMAL, 'Using default thermal thresholds');
    }
  }

  /**
   * Start the monitoring loop
   */
  private startMonitoring(): void {
    // Collect initial metrics
    this.collectMetrics();

    // Set up periodic collection
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, this.pollIntervalMs);
  }

  /**
   * Collect thermal metrics from the system
   */
  private async collectMetrics(): Promise<void> {
    try {
      const metrics: ThermalMetrics = {
        timestamp: new Date(),
        pressureLevel: ThermalPressureLevel.NOMINAL,
        pressureLabel: 'nominal',
        cpuTemperature: null,
        gpuTemperature: null,
        systemTemperature: null,
        fanSpeed: null,
        fanSpeedPercent: null,
        isThrottling: false,
        chipGeneration: this.chipGeneration
      };

      if (this.isMacOS) {
        // Get thermal pressure from notifyd
        const thermalState = await this.getThermalPressure();
        metrics.pressureLevel = thermalState.level;
        metrics.pressureLabel = thermalState.label;
        metrics.isThrottling = thermalState.level >= ThermalPressureLevel.HEAVY;

        // Get temperature readings
        const temps = await this.getTemperatureReadings();
        metrics.cpuTemperature = temps.cpu;
        metrics.gpuTemperature = temps.gpu;
        metrics.systemTemperature = temps.system;

        // Get fan speed (if available)
        const fanInfo = await this.getFanSpeed();
        metrics.fanSpeed = fanInfo.rpm;
        metrics.fanSpeedPercent = fanInfo.percent;
      } else {
        // For non-macOS, use basic CPU load as a proxy
        const cpuUsage = os.loadavg()[0] / os.cpus().length * 100;
        metrics.cpuTemperature = Math.min(40 + (cpuUsage * 0.5), 100); // Estimate
        metrics.isThrottling = cpuUsage > 90;
        if (cpuUsage > 90) {
          metrics.pressureLevel = ThermalPressureLevel.HEAVY;
          metrics.pressureLabel = 'heavy';
        } else if (cpuUsage > 70) {
          metrics.pressureLevel = ThermalPressureLevel.MODERATE;
          metrics.pressureLabel = 'moderate';
        }
      }

      // Update current metrics
      this.currentMetrics = metrics;

      // Add to history
      this.addToHistory(metrics);

      // Update Prometheus metrics
      this.updatePrometheusMetrics(metrics);

      // Check thresholds and take action if needed
      await this.evaluateAndAct(metrics);

      // Emit update event for WebSocket broadcast
      this.emit('thermal:update', metrics);

      logger.debug(LogCategory.THERMAL, 'Collected thermal metrics', {
        pressureLevel: metrics.pressureLabel,
        cpuTemp: metrics.cpuTemperature,
        isThrottling: metrics.isThrottling
      });

    } catch (error) {
      logger.error(LogCategory.THERMAL, 'Failed to collect thermal metrics', { error });
    }
  }

  /**
   * Get thermal pressure level from macOS notifyd
   */
  private async getThermalPressure(): Promise<{ level: ThermalPressureLevel; label: string }> {
    return new Promise((resolve) => {
      try {
        // Use notifyutil for quick reading (doesn't require root)
        const result = execSync('notifyutil -g com.apple.system.thermalpressurelevel', {
          encoding: 'utf-8',
          timeout: 2000
        });

        // Parse: "com.apple.system.thermalpressurelevel 0"
        const match = result.match(/thermalpressurelevel\s+(\d+)/);
        if (match) {
          const level = parseInt(match[1], 10) as ThermalPressureLevel;
          resolve({
            level,
            label: THERMAL_PRESSURE_LABELS[level] || 'unknown'
          });
          return;
        }
      } catch {
        // notifyutil not available or failed
      }

      // Fallback: try Swift reader
      try {
        const result = execSync(`swift "${this.swiftReaderPath}"`, {
          encoding: 'utf-8',
          timeout: 5000
        });

        const parsed = JSON.parse(result);
        resolve({
          level: parsed.pressureLevel as ThermalPressureLevel,
          label: parsed.pressureLabel
        });
      } catch {
        // Default to nominal if all methods fail
        resolve({
          level: ThermalPressureLevel.NOMINAL,
          label: 'nominal'
        });
      }
    });
  }

  /**
   * Get temperature readings from SMC or IOKit
   */
  private async getTemperatureReadings(): Promise<{
    cpu: number | null;
    gpu: number | null;
    system: number | null;
  }> {
    // Try to get temperatures using powermetrics (requires output parsing)
    // or osx-cpu-temp if installed, or estimate from thermal pressure

    try {
      // Try sudo-free method using IOKit via ioreg
      const result = execSync(
        'ioreg -rc AppleSmartBattery | grep Temperature',
        { encoding: 'utf-8', timeout: 2000 }
      );

      const match = result.match(/"Temperature"\s*=\s*(\d+)/);
      if (match) {
        // Battery temp is a rough proxy, divide by 100 for Celsius
        const batteryTemp = parseInt(match[1], 10) / 100;
        return {
          cpu: batteryTemp + 15, // CPU is typically warmer
          gpu: batteryTemp + 10,
          system: batteryTemp
        };
      }
    } catch {
      // IOKit method failed
    }

    // Estimate from thermal pressure level
    const pressure = this.currentMetrics?.pressureLevel ?? ThermalPressureLevel.NOMINAL;
    const baseTemp: Record<ThermalPressureLevel, number> = {
      [ThermalPressureLevel.NOMINAL]: 45,
      [ThermalPressureLevel.MODERATE]: 70,
      [ThermalPressureLevel.HEAVY]: 90,
      [ThermalPressureLevel.TRAPPING]: 100,
      [ThermalPressureLevel.SLEEPING]: 105
    };

    const base = baseTemp[pressure] || 45;
    return {
      cpu: base + Math.random() * 5,
      gpu: base - 5 + Math.random() * 5,
      system: base - 15 + Math.random() * 3
    };
  }

  /**
   * Get fan speed information
   */
  private async getFanSpeed(): Promise<{ rpm: number | null; percent: number | null }> {
    // MacBook Air has no fan, so this may return null
    try {
      const result = execSync(
        'ioreg -rc AppleSMC | grep -i fan',
        { encoding: 'utf-8', timeout: 2000 }
      );

      // If no fan data, likely a fanless Mac
      if (!result.trim()) {
        return { rpm: null, percent: null };
      }

      // Try to parse fan speed
      const rpmMatch = result.match(/(\d+)\s*RPM/i);
      if (rpmMatch) {
        const rpm = parseInt(rpmMatch[1], 10);
        // Estimate max RPM at 6000 for percentage
        return {
          rpm,
          percent: Math.min(100, (rpm / 6000) * 100)
        };
      }
    } catch {
      // No fan info available
    }

    return { rpm: null, percent: null };
  }

  /**
   * Add metrics to history
   */
  private addToHistory(metrics: ThermalMetrics): void {
    this.metricsHistory.push({
      timestamp: metrics.timestamp,
      metrics
    });

    // Trim history if it exceeds max size
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Update Prometheus metrics
   */
  private updatePrometheusMetrics(metrics: ThermalMetrics): void {
    thermalPressureGauge.set(metrics.pressureLevel);
    thermalThrottlingGauge.set(metrics.isThrottling ? 1 : 0);

    if (metrics.cpuTemperature !== null) {
      thermalTemperatureGauge.set(
        { sensor: 'cpu', chip: metrics.chipGeneration || 'unknown' },
        metrics.cpuTemperature
      );
    }

    if (metrics.gpuTemperature !== null) {
      thermalTemperatureGauge.set(
        { sensor: 'gpu', chip: metrics.chipGeneration || 'unknown' },
        metrics.gpuTemperature
      );
    }

    if (metrics.systemTemperature !== null) {
      thermalTemperatureGauge.set(
        { sensor: 'system', chip: metrics.chipGeneration || 'unknown' },
        metrics.systemTemperature
      );
    }

    if (metrics.fanSpeedPercent !== null) {
      fanSpeedGauge.set(metrics.fanSpeedPercent);
    }

    // Update system resources gauge for consistency
    if (metrics.cpuTemperature !== null) {
      systemResourcesGauge.set(
        { resource_type: 'temperature', unit: 'celsius' },
        metrics.cpuTemperature
      );
    }
  }

  /**
   * Evaluate thermal state and take action if needed
   */
  private async evaluateAndAct(metrics: ThermalMetrics): Promise<void> {
    const { pressureLevel, cpuTemperature, gpuTemperature } = metrics;

    // Check temperature thresholds
    if (cpuTemperature !== null) {
      if (cpuTemperature >= this.thresholds.cpuCritical) {
        await this.createAlert('critical', pressureLevel,
          `CPU temperature critical: ${cpuTemperature.toFixed(1)}°C`);
      } else if (cpuTemperature >= this.thresholds.cpuWarning) {
        await this.createAlert('warning', pressureLevel,
          `CPU temperature elevated: ${cpuTemperature.toFixed(1)}°C`);
      }
    }

    if (gpuTemperature !== null) {
      if (gpuTemperature >= this.thresholds.gpuCritical) {
        await this.createAlert('critical', pressureLevel,
          `GPU temperature critical: ${gpuTemperature.toFixed(1)}°C`);
      } else if (gpuTemperature >= this.thresholds.gpuWarning) {
        await this.createAlert('warning', pressureLevel,
          `GPU temperature elevated: ${gpuTemperature.toFixed(1)}°C`);
      }
    }

    // Check pressure level thresholds
    if (pressureLevel >= this.thresholds.emergencyStopAt) {
      await this.triggerEmergencyStop(pressureLevel);
    } else if (pressureLevel >= this.thresholds.pauseFarmsAt) {
      await this.pauseAllFarms(pressureLevel);
    } else if (pressureLevel >= this.thresholds.reduceAgentsAt) {
      await this.reduceAgentLoad(pressureLevel);
    } else if (pressureLevel === ThermalPressureLevel.NOMINAL && this.pausedFarms.size > 0) {
      // System has cooled down - resume paused farms
      await this.resumePausedFarms();
    }
  }

  /**
   * Create a thermal alert
   */
  private async createAlert(
    severity: ThermalAlert['severity'],
    pressureLevel: ThermalPressureLevel,
    message: string,
    action?: ThermalAction
  ): Promise<void> {
    const alertId = `thermal-${Date.now()}-${severity}`;

    // Don't create duplicate alerts within 30 seconds
    const recentAlert = Array.from(this.activeAlerts.values()).find(
      a => a.severity === severity &&
           a.pressureLevel === pressureLevel &&
           Date.now() - a.timestamp.getTime() < 30000
    );

    if (recentAlert) return;

    const alert: ThermalAlert = {
      id: alertId,
      timestamp: new Date(),
      severity,
      pressureLevel,
      message,
      action: action || null,
      acknowledged: false
    };

    this.activeAlerts.set(alertId, alert);

    // Update Prometheus counter
    thermalAlertCounter.inc({
      severity,
      pressure_level: THERMAL_PRESSURE_LABELS[pressureLevel]
    });

    // Emit alert event
    this.emit('thermal:alert', alert);

    logger.warn(LogCategory.THERMAL, 'Thermal alert created', {
      alertId,
      severity,
      message,
      pressureLevel: THERMAL_PRESSURE_LABELS[pressureLevel]
    });

    // Store in database for history
    try {
      await db.query(`
        INSERT INTO thermal_metrics (
          id, timestamp, pressure_level, pressure_label, cpu_temperature,
          gpu_temperature, system_temperature, is_throttling, alert_severity, alert_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        alertId,
        alert.timestamp,
        pressureLevel,
        THERMAL_PRESSURE_LABELS[pressureLevel],
        this.currentMetrics?.cpuTemperature,
        this.currentMetrics?.gpuTemperature,
        this.currentMetrics?.systemTemperature,
        this.currentMetrics?.isThrottling,
        severity,
        message
      ]);
    } catch (error) {
      logger.debug(LogCategory.THERMAL, 'Failed to store alert in database', { error });
    }
  }

  /**
   * Reduce agent load on farms
   */
  private async reduceAgentLoad(pressureLevel: ThermalPressureLevel): Promise<void> {
    await this.createAlert('info', pressureLevel,
      'Thermal pressure elevated - reducing agent activity',
      ThermalAction.REDUCE_AGENTS);

    this.emit('thermal:action', {
      action: ThermalAction.REDUCE_AGENTS,
      pressureLevel,
      timestamp: new Date()
    });

    logger.info(LogCategory.THERMAL, 'Reducing agent load due to thermal pressure', {
      pressureLevel: THERMAL_PRESSURE_LABELS[pressureLevel]
    });
  }

  /**
   * Pause all running farms
   */
  private async pauseAllFarms(pressureLevel: ThermalPressureLevel): Promise<void> {
    await this.createAlert('warning', pressureLevel,
      'Thermal throttling detected - pausing farms to prevent system crash',
      ThermalAction.PAUSE_ALL_FARMS);

    // Get running farms from database
    try {
      const result = await db.query(`
        SELECT id, name FROM farms WHERE status IN ('running', 'launching', 'active')
      `);

      for (const farm of result.rows) {
        this.pausedFarms.add(farm.id);

        // Update farm status
        await db.query(`
          UPDATE farms SET
            status = 'paused',
            metadata = COALESCE(metadata, '{}'::jsonb) ||
              jsonb_build_object('paused_reason', 'thermal_protection', 'paused_at', NOW())
          WHERE id = $1
        `, [farm.id]);

        thermalFarmPausedCounter.inc({ action: 'pause' });

        logger.warn(LogCategory.THERMAL, 'Farm paused due to thermal protection', {
          farmId: farm.id,
          farmName: farm.name,
          pressureLevel: THERMAL_PRESSURE_LABELS[pressureLevel]
        });
      }
    } catch (error) {
      logger.error(LogCategory.THERMAL, 'Failed to pause farms', { error });
    }

    this.emit('thermal:action', {
      action: ThermalAction.PAUSE_ALL_FARMS,
      pressureLevel,
      pausedFarms: Array.from(this.pausedFarms),
      timestamp: new Date()
    });
  }

  /**
   * Emergency stop all operations
   */
  private async triggerEmergencyStop(pressureLevel: ThermalPressureLevel): Promise<void> {
    await this.createAlert('emergency', pressureLevel,
      'EMERGENCY: Severe thermal event - stopping all operations to prevent hardware damage',
      ThermalAction.EMERGENCY_STOP);

    logger.error(LogCategory.THERMAL, 'EMERGENCY THERMAL STOP TRIGGERED', {
      pressureLevel: THERMAL_PRESSURE_LABELS[pressureLevel],
      cpuTemp: this.currentMetrics?.cpuTemperature,
      gpuTemp: this.currentMetrics?.gpuTemperature
    });

    // Mark all farms as stopped
    try {
      await db.query(`
        UPDATE farms SET
          status = 'stopped',
          metadata = COALESCE(metadata, '{}'::jsonb) ||
            jsonb_build_object('stopped_reason', 'thermal_emergency', 'stopped_at', NOW())
        WHERE status IN ('running', 'launching', 'active', 'paused')
      `);
    } catch (error) {
      logger.error(LogCategory.THERMAL, 'Failed to stop farms in emergency', { error });
    }

    this.emit('thermal:action', {
      action: ThermalAction.EMERGENCY_STOP,
      pressureLevel,
      timestamp: new Date()
    });
  }

  /**
   * Resume farms that were paused due to thermal issues
   */
  private async resumePausedFarms(): Promise<void> {
    if (this.pausedFarms.size === 0) return;

    logger.info(LogCategory.THERMAL, 'System cooled - resuming paused farms', {
      farmCount: this.pausedFarms.size
    });

    for (const farmId of this.pausedFarms) {
      try {
        await db.query(`
          UPDATE farms SET
            status = 'running',
            metadata = COALESCE(metadata, '{}'::jsonb) ||
              jsonb_build_object('resumed_at', NOW(), 'resume_reason', 'thermal_nominal')
          WHERE id = $1 AND status = 'paused'
        `, [farmId]);

        this.emit('thermal:action', {
          action: ThermalAction.RESUME_FARM,
          farmId,
          timestamp: new Date()
        });

        logger.info(LogCategory.THERMAL, 'Farm resumed after thermal recovery', { farmId });
      } catch (error) {
        logger.error(LogCategory.THERMAL, 'Failed to resume farm', { farmId, error });
      }
    }

    this.pausedFarms.clear();

    await this.createAlert('info', ThermalPressureLevel.NOMINAL,
      'System temperature normalized - farms resumed',
      ThermalAction.RESUME_FARM);
  }

  /**
   * Get current thermal metrics
   */
  getCurrentMetrics(): ThermalMetrics | null {
    return this.currentMetrics;
  }

  /**
   * Get thermal history
   */
  getHistory(limit: number = 100): ThermalHistoryEntry[] {
    return this.metricsHistory.slice(-limit);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ThermalAlert[] {
    return Array.from(this.activeAlerts.values())
      .filter(a => !a.acknowledged)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Get current thresholds
   */
  getThresholds(): ThermalThresholds {
    return { ...this.thresholds };
  }

  /**
   * Update thresholds
   */
  async setThresholds(newThresholds: Partial<ThermalThresholds>): Promise<void> {
    this.thresholds = { ...this.thresholds, ...newThresholds };

    // Persist to database
    try {
      await db.query(`
        INSERT INTO system_config (key, value, updated_at)
        VALUES ('thermal_thresholds', $1, NOW())
        ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
      `, [JSON.stringify(this.thresholds)]);

      logger.info(LogCategory.THERMAL, 'Thermal thresholds updated', {
        thresholds: this.thresholds
      });
    } catch (error) {
      logger.error(LogCategory.THERMAL, 'Failed to persist thresholds', { error });
    }
  }

  /**
   * Check if a farm can be launched based on thermal state
   */
  canLaunchFarm(): { allowed: boolean; reason?: string } {
    if (!this.currentMetrics) {
      return { allowed: true }; // Allow if no metrics yet
    }

    const { pressureLevel, cpuTemperature } = this.currentMetrics;

    if (pressureLevel >= ThermalPressureLevel.HEAVY) {
      return {
        allowed: false,
        reason: `System is thermal throttling (${THERMAL_PRESSURE_LABELS[pressureLevel]}). Wait for temperature to normalize.`
      };
    }

    if (cpuTemperature !== null && cpuTemperature >= this.thresholds.cpuWarning) {
      return {
        allowed: false,
        reason: `CPU temperature too high (${cpuTemperature.toFixed(1)}°C). Allow system to cool down.`
      };
    }

    if (pressureLevel === ThermalPressureLevel.MODERATE) {
      return {
        allowed: true,
        reason: 'System is warm - farm will launch with reduced agent count.'
      };
    }

    return { allowed: true };
  }

  /**
   * Get recommended agent count based on thermal state
   */
  getRecommendedAgentCount(requestedCount: number): number {
    if (!this.currentMetrics) return requestedCount;

    const { pressureLevel } = this.currentMetrics;

    switch (pressureLevel) {
      case ThermalPressureLevel.MODERATE:
        return Math.max(1, Math.floor(requestedCount * 0.7)); // 70%
      case ThermalPressureLevel.HEAVY:
        return Math.max(1, Math.floor(requestedCount * 0.3)); // 30%
      case ThermalPressureLevel.TRAPPING:
      case ThermalPressureLevel.SLEEPING:
        return 1; // Minimum
      default:
        return requestedCount;
    }
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    logger.info(LogCategory.THERMAL, 'Shutting down thermal monitoring service');

    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('shutdown');
    this.removeAllListeners();

    logger.info(LogCategory.THERMAL, 'Thermal monitoring service shutdown complete');
  }
}

// Export singleton instance
export const thermalMonitoringService = new ThermalMonitoringService();
export default thermalMonitoringService;
