/**
 * Weather Reports for the Digital Farm
 *
 * "Every farmer checks the weather!" ☀️
 */

import chalk from 'chalk';

export class WeatherReport {
  private static conditions = [
    { emoji: '☀️', condition: 'Sunny', message: 'Perfect coding weather! High productivity expected!' },
    { emoji: '⛅', condition: 'Partly Cloudy', message: 'Good conditions for debugging.' },
    { emoji: '☁️', condition: 'Cloudy', message: 'Overcast but stable. Great for long coding sessions.' },
    { emoji: '🌧️', condition: 'Rainy', message: 'Stay indoors and code! Perfect weather for development.' },
    { emoji: '⛈️', condition: 'Stormy', message: 'Turbulent conditions! Expect some bugs in the system.' },
    { emoji: '🌈', condition: 'Rainbow', message: 'Beautiful conditions! Your code will shine today!' },
    { emoji: '🌪️', condition: 'Tornado', message: 'Warning! Refactoring storm approaching!' },
    { emoji: '❄️', condition: 'Snowy', message: 'Code freeze warning! Bundle up your modules!' },
    { emoji: '🌤️', condition: 'Clearing', message: 'Conditions improving! Bugs clearing out.' },
    { emoji: '🌫️', condition: 'Foggy', message: 'Low visibility. Use extra logging today.' }
  ];

  /**
   * Get today's digital farm forecast
   */
  static getTodaysForecast(): string {
    const weather = this.conditions[Math.floor(Math.random() * this.conditions.length)];
    const temp = Math.floor(Math.random() * 30) + 60; // 60-90°F

    return chalk.blue(
      `📍 Digital Farm Weather Report:\n` +
      `   ${weather.emoji} ${weather.condition} - ${temp}°F\n` +
      `   ${weather.message}`
    );
  }

  /**
   * Get weather based on system status
   */
  static getSystemWeather(status: {
    cpuLoad?: number;
    memoryUsage?: number;
    errorRate?: number;
  }): string {
    let condition = '☀️ All Clear';
    let message = 'Perfect conditions for farming!';

    if (status.errorRate && status.errorRate > 10) {
      condition = '⛈️ Storm Warning';
      message = 'High error rate detected! Seek shelter in try-catch blocks!';
    } else if (status.cpuLoad && status.cpuLoad > 80) {
      condition = '🔥 Heat Wave';
      message = 'CPU running hot! Consider load balancing!';
    } else if (status.memoryUsage && status.memoryUsage > 90) {
      condition = '🌫️ Dense Fog';
      message = 'Memory usage high! Visibility reduced!';
    } else if (status.cpuLoad && status.cpuLoad < 20) {
      condition = '🌤️ Calm & Clear';
      message = 'Light workload. Perfect for new features!';
    }

    return `${condition}: ${message}`;
  }

  /**
   * Get seasonal message
   */
  static getSeasonalMessage(): string {
    const month = new Date().getMonth();
    const messages: Record<string, string> = {
      spring: '🌸 Spring is here! Time to plant new features!',
      summer: '☀️ Summer heat! Keep your code cool with proper ventilation!',
      fall: '🍂 Harvest season! Time to reap what you\'ve coded!',
      winter: '❄️ Winter is coming! Prepare your code for hibernation!'
    };

    if (month >= 2 && month <= 4) return messages.spring;
    if (month >= 5 && month <= 7) return messages.summer;
    if (month >= 8 && month <= 10) return messages.fall;
    return messages.winter;
  }

  /**
   * Get farming almanac wisdom
   */
  static getAlmanacWisdom(): string {
    const wisdom = [
      '📅 "Plant your tests in spring, debug in summer, harvest in fall."',
      '🌙 "Code by the phases of the sprint cycle."',
      '⭐ "When stars align, merge your PRs."',
      '🌊 "High tide brings bugs, low tide brings features."',
      '🍃 "When the wind blows east, refactor the least."',
      '🌻 "Sunflowers face the sun, code should face the user."',
      '🐛 "Early bird catches the bug, but the second mouse gets the cheese."',
      '🌾 "Wheat grows in rows, so should your code."'
    ];

    return chalk.gray(wisdom[Math.floor(Math.random() * wisdom.length)]);
  }

  /**
   * Get a 5-day forecast
   */
  static getFiveDayForecast(): string[] {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const forecast: string[] = [];

    for (const day of days) {
      const weather = this.conditions[Math.floor(Math.random() * this.conditions.length)];
      const temp = Math.floor(Math.random() * 30) + 60;
      forecast.push(`${day}: ${weather.emoji} ${temp}°F`);
    }

    return forecast;
  }

  /**
   * Get weather alerts
   */
  static getWeatherAlert(farmStatus: string): string | null {
    const alerts: Record<string, string> = {
      'failing': '⚠️ SEVERE: Bug storm detected! All hands on deck!',
      'timeout': '⏰ WARNING: Time pressure system moving in!',
      'memory': '🌫️ ADVISORY: Memory fog warning! Clear unnecessary objects!',
      'overload': '🔥 EXTREME: System overheating! Reduce agent count!'
    };

    return alerts[farmStatus] || null;
  }

  /**
   * Get UV (Update Version) Index
   */
  static getUVIndex(): string {
    const index = Math.floor(Math.random() * 11);
    let warning = '';

    if (index <= 2) warning = 'Low - Safe to deploy';
    else if (index <= 5) warning = 'Moderate - Test thoroughly';
    else if (index <= 7) warning = 'High - Use protection (tests)';
    else if (index <= 10) warning = 'Very High - Danger! Review carefully';
    else warning = 'Extreme - Do not deploy!';

    return `UV (Update Version) Index: ${index} - ${warning}`;
  }
}

export default WeatherReport;