import { EventEmitter } from 'events';

interface EventRule {
  source: string;
  event: string;
  handler: (data: any) => any;
}

interface RuleStats {
  source: string;
  event: string;
  processedCount: number;
  successRate: number;
}

/**
 * EventBridge - Cross-system event coordination utility
 *
 * This module provides a lightweight event bridge for coordinating
 * events across different subsystems in the application.
 */
class EventBridge extends EventEmitter {
  private rules: EventRule[] = [];
  private stats: Map<string, { processed: number; success: number }> = new Map();

  /**
   * Process an event through registered rules
   */
  processEvent(source: string, event: string, data: any): any[] {
    const results: any[] = [];
    const key = `${source}:${event}`;

    const stat = this.stats.get(key) || { processed: 0, success: 0 };
    stat.processed++;

    for (const rule of this.rules) {
      if (rule.source === source && rule.event === event) {
        try {
          const result = rule.handler(data);
          results.push(result);
          stat.success++;
        } catch (error) {
          // Log but continue processing other rules
          console.error(`EventBridge rule error for ${key}:`, error);
        }
      }
    }

    this.stats.set(key, stat);
    this.emit(event, { source, data, results });

    return results;
  }

  /**
   * Add a rule to the event bridge
   */
  addRule(rule: EventRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a rule from the event bridge
   */
  removeRule(source: string, event: string): void {
    this.rules = this.rules.filter(
      r => !(r.source === source && r.event === event)
    );
  }

  /**
   * Get statistics about event processing
   */
  getStats(): {
    totalRules: number;
    totalProcessed: number;
    overallSuccessRate: number;
    ruleStats: RuleStats[];
  } {
    let totalProcessed = 0;
    let totalSuccess = 0;
    const ruleStats: RuleStats[] = [];

    for (const [key, stat] of this.stats.entries()) {
      const [source, event] = key.split(':');
      totalProcessed += stat.processed;
      totalSuccess += stat.success;
      ruleStats.push({
        source,
        event,
        processedCount: stat.processed,
        successRate: stat.processed > 0 ? stat.success / stat.processed : 0,
      });
    }

    return {
      totalRules: this.rules.length,
      totalProcessed,
      overallSuccessRate: totalProcessed > 0 ? totalSuccess / totalProcessed : 0,
      ruleStats,
    };
  }

  /**
   * Clear all rules and stats
   */
  clear(): void {
    this.rules = [];
    this.stats.clear();
    this.removeAllListeners();
  }
}

export const eventBridge = new EventBridge();
export { EventBridge, EventRule, RuleStats };
