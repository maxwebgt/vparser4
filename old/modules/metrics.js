import { log } from './logger.js';

/**
 * Class for tracking various metrics during scraping
 */
export class MetricsTracker {
  constructor() {
    this.metrics = {
      startTime: new Date(),
      memoryBaseline: process.memoryUsage(),
      requestStats: {
        total: 0,
        success: 0,
        failed: 0,
        protectionHits: 0
      },
      memoryUsage: [],
      requestTimes: [],
      totalTraffic: 0
    };
  }

  /**
   * Track start of a request
   */
  startRequest() {
    return {
      startTime: new Date(),
      startMemory: process.memoryUsage()
    };
  }

  /**
   * Track end of a request
   */
  endRequest(requestData, success, protectionHit = false) {
    const endTime = new Date();
    const endMemory = process.memoryUsage();
    
    // Calculate duration in ms
    const duration = endTime - requestData.startTime;
    
    // Calculate memory usage differences in MB
    const memoryDiff = {
      rss: (endMemory.rss - requestData.startMemory.rss) / (1024 * 1024),
      heapTotal: (endMemory.heapTotal - requestData.startMemory.heapTotal) / (1024 * 1024),
      heapUsed: (endMemory.heapUsed - requestData.startMemory.heapUsed) / (1024 * 1024),
      external: (endMemory.external - requestData.startMemory.external) / (1024 * 1024)
    };
    
    // Update metrics
    this.metrics.requestStats.total++;
    if (success) {
      this.metrics.requestStats.success++;
    } else {
      this.metrics.requestStats.failed++;
    }
    
    if (protectionHit) {
      this.metrics.requestStats.protectionHits++;
    }
    
    this.metrics.requestTimes.push(duration);
    this.metrics.memoryUsage.push(memoryDiff);
    
    // Return metrics for this request
    return {
      duration,
      memoryDiff,
      success,
      protectionHit
    };
  }

  /**
   * Track page load size
   */
  trackPageSize(bytes) {
    this.metrics.totalTraffic += bytes;
    return this.metrics.totalTraffic;
  }

  /**
   * Get memory usage in MB
   */
  getCurrentMemoryUsage() {
    const memory = process.memoryUsage();
    return {
      rss: memory.rss / (1024 * 1024),
      heapTotal: memory.heapTotal / (1024 * 1024),
      heapUsed: memory.heapUsed / (1024 * 1024),
      external: memory.external / (1024 * 1024)
    };
  }

  /**
   * Get all metrics
   */
  getMetrics() {
    const currentTime = new Date();
    const totalDuration = currentTime - this.metrics.startTime;
    
    // Calculate average request time
    const avgRequestTime = this.metrics.requestTimes.length > 0
      ? this.metrics.requestTimes.reduce((sum, time) => sum + time, 0) / this.metrics.requestTimes.length
      : 0;
    
    // Calculate average memory usage
    const avgMemoryUsage = {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0
    };
    
    if (this.metrics.memoryUsage.length > 0) {
      const sum = this.metrics.memoryUsage.reduce((acc, mem) => {
        return {
          rss: acc.rss + mem.rss,
          heapTotal: acc.heapTotal + mem.heapTotal,
          heapUsed: acc.heapUsed + mem.heapUsed,
          external: acc.external + mem.external
        };
      }, { rss: 0, heapTotal: 0, heapUsed: 0, external: 0 });
      
      const count = this.metrics.memoryUsage.length;
      avgMemoryUsage.rss = sum.rss / count;
      avgMemoryUsage.heapTotal = sum.heapTotal / count;
      avgMemoryUsage.heapUsed = sum.heapUsed / count;
      avgMemoryUsage.external = sum.external / count;
    }
    
    return {
      duration: {
        total: totalDuration,
        avgRequest: avgRequestTime
      },
      requests: this.metrics.requestStats,
      memory: {
        current: this.getCurrentMemoryUsage(),
        average: avgMemoryUsage
      },
      successRate: this.metrics.requestStats.total > 0
        ? (this.metrics.requestStats.success / this.metrics.requestStats.total * 100).toFixed(2) + '%'
        : 'N/A',
      totalTraffic: this.metrics.totalTraffic,
      totalTrafficFormatted: this.formatFileSize(this.metrics.totalTraffic)
    };
  }

  /**
   * Format file size to human-readable format
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Log current metrics
   */
  logMetrics() {
    const metrics = this.getMetrics();
    
    log('┌─────────────── SCRAPING METRICS ────────────────┐', 'info');
    log(`│ Total Runtime: ${(metrics.duration.total / 1000).toFixed(2)} seconds${' '.repeat(17)} │`, 'info');
    log(`│ Requests: Total=${metrics.requests.total}, Success=${metrics.requests.success}, Failed=${metrics.requests.failed} │`, 'info');
    log(`│ Success Rate: ${metrics.successRate}${' '.repeat(32)} │`, 'info');
    log(`│ Protection Hits: ${metrics.requests.protectionHits}${' '.repeat(28)} │`, 'info');
    log(`│ Avg Request Time: ${metrics.duration.avgRequest.toFixed(2)} ms${' '.repeat(18)} │`, 'info');
    log(`│ Total Traffic: ${metrics.totalTrafficFormatted}${' '.repeat(29)} │`, 'info');
    log('├────────────── MEMORY USAGE (MB) ───────────────┤', 'info');
    log(`│ Current RSS: ${metrics.memory.current.rss.toFixed(2)}${' '.repeat(30)} │`, 'info');
    log(`│ Current Heap Used: ${metrics.memory.current.heapUsed.toFixed(2)}${' '.repeat(23)} │`, 'info');
    log(`│ Avg Heap Used per Request: ${metrics.memory.average.heapUsed.toFixed(2)}${' '.repeat(17)} │`, 'info');
    log('└──────────────────────────────────────────────────┘', 'info');
    
    return metrics;
  }
}

// Singleton instance
let metricsInstance = null;

/**
 * Get the metrics tracker instance (singleton)
 */
export const getMetricsTracker = () => {
  if (!metricsInstance) {
    metricsInstance = new MetricsTracker();
  }
  return metricsInstance;
};

export default {
  getMetricsTracker
};
