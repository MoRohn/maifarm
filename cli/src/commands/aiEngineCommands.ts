/**
 * AI Engine Commands - Manage AI engine models, versions, and costs
 *
 * Commands:
 * - engines status     : Show status of all AI engines
 * - engines models    : List available models for a provider
 * - engines change    : Change the active model
 * - engines upgrade   : Upgrade engine to latest version
 * - engines costs     : View cost metrics
 */

import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import axios from 'axios';
import inquirer from 'inquirer';

export class AIEngineCommands {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  /**
   * Show status of all AI engines
   */
  async showEngineStatus() {
    const spinner = ora('Fetching AI engine status...').start();

    try {
      const response = await axios.get(`${this.apiUrl}/api/ai-engines/status`);
      spinner.succeed('Engine status retrieved');

      const { engines } = response.data;

      if (!engines || engines.length === 0) {
        console.log(chalk.yellow('\n⚠️  No engines configured'));
        return;
      }

      // Create table
      const table = new Table({
        head: [
          chalk.cyan('Provider'),
          chalk.cyan('Status'),
          chalk.cyan('Model'),
          chalk.cyan('Version'),
          chalk.cyan('Context'),
          chalk.cyan('API Key')
        ],
        colWidths: [12, 12, 35, 15, 12, 12]
      });

      engines.forEach((engine: any) => {
        const statusIcon = engine.enabled
          ? chalk.green('✓ Enabled')
          : chalk.gray('○ Disabled');

        const versionStatus = engine.version.updateAvailable
          ? chalk.yellow(`${engine.version.current} (⚠️  ${engine.version.latest} available)`)
          : chalk.green(engine.version.current);

        const contextWindow = `${(engine.contextWindow / 1000).toFixed(0)}K`;
        const apiKeyStatus = engine.hasApiKey
          ? chalk.green('✓ Set')
          : chalk.red('✗ Missing');

        table.push([
          chalk.bold(engine.provider.toUpperCase()),
          statusIcon,
          engine.model,
          versionStatus,
          contextWindow,
          apiKeyStatus
        ]);
      });

      console.log('\n📊 AI Engine Status\n');
      console.log(table.toString());

      // Show deprecation warnings
      const deprecated = engines.filter((e: any) => e.version.isDeprecated);
      if (deprecated.length > 0) {
        console.log(chalk.yellow('\n⚠️  Deprecated Versions:'));
        deprecated.forEach((engine: any) => {
          console.log(
            chalk.yellow(
              `   ${engine.provider}: ${engine.version.current} - Please upgrade to ${engine.version.latest}`
            )
          );
        });
      }

      // Show update tips
      const updatesAvailable = engines.filter((e: any) => e.version.updateAvailable);
      if (updatesAvailable.length > 0) {
        console.log(chalk.cyan('\n💡 Tip: Run') + chalk.white(' farm engines upgrade <provider> ') + chalk.cyan('to update'));
      }

    } catch (error: any) {
      spinner.fail('Failed to fetch engine status');
      if (error.response) {
        console.error(
          chalk.red(`\n❌ API Error: ${error.response.data?.message || error.message}`)
        );
      } else {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
      }
    }
  }

  /**
   * List available models for a provider
   */
  async listModels(provider?: string) {
    if (!provider) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select AI provider:',
          choices: [
            { name: '🧠 Claude (Anthropic)', value: 'claude' },
            { name: '🤖 OpenAI GPT', value: 'openai' }
          ]
        }
      ]);
      provider = answers.provider;
    }

    if (!provider) {
      console.log(chalk.red('No provider selected'));
      return;
    }

    const spinner = ora(`Fetching available ${provider} models...`).start();

    try {
      const response = await axios.get(`${this.apiUrl}/api/ai-engines/${provider}/models`);
      spinner.succeed(`${provider.toUpperCase()} models retrieved`);

      const { currentModel, models, recommendedModel } = response.data;

      if (!models || models.length === 0) {
        console.log(chalk.yellow(`\n⚠️  No models available for ${provider}`));
        return;
      }

      console.log(chalk.bold(`\n📋 Available ${provider.toUpperCase()} Models\n`));

      if (currentModel) {
        console.log(chalk.green(`Current Model: ${currentModel}\n`));
      }

      // Create table
      const table = new Table({
        head: [
          chalk.cyan('Model'),
          chalk.cyan('Status'),
          chalk.cyan('Context'),
          chalk.cyan('Cost (Input/Output)'),
          chalk.cyan('Speed'),
          chalk.cyan('Quality')
        ],
        colWidths: [35, 12, 10, 25, 10, 10]
      });

      models.forEach((model: any) => {
        const statusBadges: string[] = [];

        if (model.id === currentModel) {
          statusBadges.push(chalk.green('ACTIVE'));
        }
        if (model.isDefault) {
          statusBadges.push(chalk.blue('⭐'));
        }
        if (model.isDeprecated) {
          statusBadges.push(chalk.red('DEPR'));
        }

        const contextWindow = `${(model.contextWindow / 1000).toFixed(0)}K`;
        const costs = `$${model.costPer1kPromptTokens}/$${model.costPer1kCompletionTokens}`;

        const speedIcon = model.performanceProfile?.speed === 'fast' ? '⚡' :
                         model.performanceProfile?.speed === 'slow' ? '🐌' : '⚡';
        const qualityIcon = model.performanceProfile?.quality === 'premium' ? '⭐⭐⭐' :
                           model.performanceProfile?.quality === 'high' ? '⭐⭐' : '⭐';

        const status = statusBadges.length > 0 ? statusBadges.join(' ') : '-';

        table.push([
          model.displayName,
          status,
          contextWindow,
          costs,
          speedIcon,
          qualityIcon
        ]);
      });

      console.log(table.toString());

      // Show capabilities legend
      console.log(chalk.gray('\n📊 Model Capabilities:'));
      const allCapabilities = new Set<string>();
      models.forEach((model: any) => {
        model.capabilities?.forEach((cap: string) => allCapabilities.add(cap));
      });

      if (allCapabilities.size > 0) {
        const capsList = Array.from(allCapabilities).slice(0, 8);
        console.log(chalk.gray(`   ${capsList.join(', ')}`));
      }

      // Show recommended model
      if (recommendedModel) {
        const recommended = models.find((m: any) => m.id === recommendedModel);
        if (recommended) {
          console.log(chalk.cyan('\n💡 Recommended:') + chalk.white(` ${recommended.displayName}`));
        }
      }

      // Show change tip
      console.log(chalk.cyan('\n💡 Tip: Run') + chalk.white(` farm engines change ${provider} `) + chalk.cyan('to switch models'));

    } catch (error: any) {
      spinner.fail(`Failed to fetch ${provider} models`);
      if (error.response) {
        console.error(
          chalk.red(`\n❌ API Error: ${error.response.data?.message || error.message}`)
        );
      } else {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
      }
    }
  }

  /**
   * Change active model for a provider
   */
  async changeModel(provider?: string, modelId?: string) {
    if (!provider) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select AI provider:',
          choices: [
            { name: '🧠 Claude (Anthropic)', value: 'claude' },
            { name: '🤖 OpenAI GPT', value: 'openai' }
          ]
        }
      ]);
      provider = answers.provider;
    }

    // Fetch available models
    let models: any[] = [];
    try {
      const response = await axios.get(`${this.apiUrl}/api/ai-engines/${provider}/models`);
      models = response.data.models || [];
    } catch (error) {
      console.error(chalk.red('❌ Failed to fetch models'));
      return;
    }

    if (!modelId) {
      // Interactive model selection
      const choices = models.map((model: any) => ({
        name: `${model.displayName} ${model.isDefault ? chalk.blue('(⭐ Recommended)') : ''} ${model.isDeprecated ? chalk.red('(Deprecated)') : ''}`,
        value: model.id,
        short: model.displayName
      }));

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'modelId',
          message: 'Select model:',
          choices,
          pageSize: 10
        },
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Confirm model change?',
          default: true
        }
      ]);

      if (!answers.confirm) {
        console.log(chalk.yellow('\n⚠️  Model change cancelled'));
        return;
      }

      modelId = answers.modelId;
    }

    const spinner = ora(`Changing ${provider} model to ${modelId}...`).start();

    try {
      const response = await axios.post(`${this.apiUrl}/api/ai-engines/${provider}/model`, {
        modelId,
        validateCompatibility: true
      });

      const result = response.data;

      if (result.success) {
        spinner.succeed(`Model changed successfully`);
        console.log(chalk.green('\n✅ Model Change Complete'));
        console.log(chalk.gray(`   Previous: ${result.previousModel}`));
        console.log(chalk.green(`   Current:  ${result.newModel}`));

        // Show warnings if any
        if (result.warnings && result.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Warnings:'));
          result.warnings.forEach((warning: string) => {
            console.log(chalk.yellow(`   • ${warning}`));
          });
        }

        // Show compatibility issues
        if (result.compatibilityIssues && result.compatibilityIssues.length > 0) {
          console.log(chalk.yellow('\n⚠️  Compatibility Issues:'));
          result.compatibilityIssues.forEach((issue: any) => {
            const icon = issue.type === 'error' ? '❌' : '⚠️';
            console.log(chalk.yellow(`   ${icon} ${issue.feature}: ${issue.message}`));
            if (issue.resolution) {
              console.log(chalk.gray(`      → ${issue.resolution}`));
            }
          });
        }

        if (result.requiresRestart) {
          console.log(chalk.yellow('\n⚠️  Server restart required for changes to take effect'));
        }

      } else {
        spinner.fail('Model change failed');
        console.error(chalk.red('\n❌ Failed to change model'));
      }

    } catch (error: any) {
      spinner.fail('Model change failed');
      if (error.response) {
        console.error(
          chalk.red(`\n❌ API Error: ${error.response.data?.message || error.message}`)
        );
      } else {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
      }
    }
  }

  /**
   * Upgrade engine to latest version
   */
  async upgradeEngine(provider?: string, options: { force?: boolean; skipBackup?: boolean } = {}) {
    if (!provider) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'Select AI provider to upgrade:',
          choices: [
            { name: '🧠 Claude (Anthropic)', value: 'claude' },
            { name: '🤖 OpenAI GPT', value: 'openai' }
          ]
        }
      ]);
      provider = answers.provider;
    }

    if (!provider) {
      console.log(chalk.red('No provider selected'));
      return;
    }

    // Fetch current version
    let versionInfo: any;
    try {
      const response = await axios.get(`${this.apiUrl}/api/ai-engines/${provider}/version`);
      versionInfo = response.data.version;
    } catch (error) {
      console.error(chalk.red('❌ Failed to fetch version information'));
      return;
    }

    // Check if update available
    if (!versionInfo.updateAvailable && !options.force) {
      console.log(chalk.green(`\n✅ ${provider.toUpperCase()} is already up to date (${versionInfo.current})`));
      return;
    }

    // Show upgrade info
    console.log(chalk.bold(`\n🚀 ${provider.toUpperCase()} Upgrade Available\n`));
    console.log(chalk.gray(`   Current:  ${versionInfo.current}`));
    console.log(chalk.green(`   Latest:   ${versionInfo.latest}`));

    if (versionInfo.isDeprecated) {
      console.log(chalk.red('\n⚠️  Your current version is deprecated!'));
    }

    // Confirm upgrade
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Proceed with upgrade?',
          default: true
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('\n⚠️  Upgrade cancelled'));
        return;
      }
    }

    const spinner = ora(`Upgrading ${provider} to ${versionInfo.latest}...`).start();

    try {
      const response = await axios.post(`${this.apiUrl}/api/ai-engines/${provider}/upgrade`, {
        targetVersion: versionInfo.latest,
        forceUpgrade: options.force || false,
        backupConfig: !options.skipBackup
      });

      const result = response.data;

      if (result.success) {
        spinner.succeed('Upgrade complete!');
        console.log(chalk.green('\n✅ Upgrade Successful'));
        console.log(chalk.gray(`   From: ${result.previousVersion}`));
        console.log(chalk.green(`   To:   ${result.newVersion}`));

        // Show upgrade steps
        if (result.upgradeSteps && result.upgradeSteps.length > 0) {
          console.log(chalk.cyan('\n📋 Upgrade Steps:'));
          result.upgradeSteps.forEach((step: any, idx: number) => {
            const statusIcon = step.status === 'completed' ? chalk.green('✓') :
                              step.status === 'failed' ? chalk.red('✗') :
                              step.status === 'skipped' ? chalk.gray('○') : '●';
            console.log(`   ${statusIcon} ${step.name}`);
            if (step.message) {
              console.log(chalk.gray(`      ${step.message}`));
            }
          });
        }

        // Show warnings
        if (result.warnings && result.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Warnings:'));
          result.warnings.forEach((warning: string) => {
            console.log(chalk.yellow(`   • ${warning}`));
          });
        }

        // Show errors
        if (result.errors && result.errors.length > 0) {
          console.log(chalk.red('\n❌ Errors:'));
          result.errors.forEach((error: string) => {
            console.log(chalk.red(`   • ${error}`));
          });
        }

        // Show rollback availability
        if (result.rollbackAvailable) {
          console.log(chalk.cyan('\n💡 Backup created - rollback available if needed'));
        }

      } else {
        spinner.fail('Upgrade failed');
        console.error(chalk.red('\n❌ Upgrade Failed'));
        if (result.errors) {
          result.errors.forEach((error: string) => {
            console.error(chalk.red(`   • ${error}`));
          });
        }
      }

    } catch (error: any) {
      spinner.fail('Upgrade failed');
      if (error.response) {
        console.error(
          chalk.red(`\n❌ API Error: ${error.response.data?.message || error.message}`)
        );
      } else {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
      }
    }
  }

  /**
   * View cost metrics
   */
  async viewCosts(provider?: string, options: { days?: number } = {}) {
    const spinner = ora('Fetching cost metrics...').start();

    try {
      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (options.days || 30));

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        groupBy: 'day'
      });

      const url = provider
        ? `${this.apiUrl}/api/ai-engines/costs/${provider}?${params}`
        : `${this.apiUrl}/api/ai-engines/costs?${params}`;

      const response = await axios.get(url);
      spinner.succeed('Cost metrics retrieved');

      const { summary, byProvider } = response.data;

      // Summary
      console.log(chalk.bold('\n💰 Cost Summary\n'));
      console.log(chalk.gray(`   Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`));
      console.log(chalk.white(`   Total Cost:     ${chalk.bold('$' + summary.totalCost.toFixed(4))}`));
      console.log(chalk.white(`   Total Requests: ${chalk.bold(summary.totalRequests.toLocaleString())}`));
      console.log(chalk.white(`   Total Tokens:   ${chalk.bold(summary.totalTokens.toLocaleString())}`));

      // By Provider
      if (byProvider && byProvider.length > 0) {
        console.log(chalk.bold('\n📊 Cost by Provider\n'));

        const table = new Table({
          head: [
            chalk.cyan('Provider'),
            chalk.cyan('Cost'),
            chalk.cyan('Requests'),
            chalk.cyan('Tokens'),
            chalk.cyan('Avg/Request')
          ],
          colWidths: [12, 15, 15, 20, 15]
        });

        byProvider.forEach((p: any) => {
          const avgCost = p.totalRequests > 0
            ? (p.totalCost / p.totalRequests).toFixed(6)
            : '0.000000';

          table.push([
            chalk.bold(p.provider.toUpperCase()),
            `$${p.totalCost.toFixed(4)}`,
            p.totalRequests.toLocaleString(),
            p.totalTokens.toLocaleString(),
            `$${avgCost}`
          ]);

          // Show models for this provider
          if (p.models && p.models.length > 0) {
            const topModels = p.models
              .sort((a: any, b: any) => b.cost - a.cost)
              .slice(0, 3);

            topModels.forEach((model: any) => {
              table.push([
                chalk.gray(`  └─ ${model.model}`),
                chalk.gray(`$${model.cost.toFixed(4)}`),
                chalk.gray(model.requests.toLocaleString()),
                chalk.gray(model.inputTokens.toLocaleString()),
                ''
              ]);
            });
          }
        });

        console.log(table.toString());
      }

      // Cost optimization tips
      console.log(chalk.cyan('\n💡 Cost Optimization Tips:'));
      console.log(chalk.gray('   • Use cheaper models for simple tasks'));
      console.log(chalk.gray('   • Implement caching to reduce redundant calls'));
      console.log(chalk.gray('   • Monitor token usage and optimize prompts'));
      console.log(chalk.gray('   • Set budget alerts to track spending'));

    } catch (error: any) {
      spinner.fail('Failed to fetch cost metrics');
      if (error.response) {
        console.error(
          chalk.red(`\n❌ API Error: ${error.response.data?.message || error.message}`)
        );
      } else {
        console.error(chalk.red(`\n❌ Error: ${error.message}`));
      }
    }
  }
}
