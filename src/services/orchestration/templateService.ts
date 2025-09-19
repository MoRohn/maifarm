import { v4 as uuidv4 } from 'uuid'
import { FarmTemplate } from '@/types/orchestration'
import { auditService } from '../audit'
import { encryptionService } from '../encryptionService'

class TemplateService {
  private templates: Map<string, FarmTemplate> = new Map()
  private customTemplates: Map<string, FarmTemplate> = new Map()

  constructor() {
    this.loadBuiltInTemplates()
  }

  private loadBuiltInTemplates() {
    // Built-in templates are loaded from farmOrchestrator
    // This service handles custom template management
  }

  async createTemplate(template: Omit<FarmTemplate, 'id' | 'metadata'>): Promise<FarmTemplate> {
    const id = uuidv4()
    const now = new Date()

    const newTemplate: FarmTemplate = {
      ...template,
      id,
      metadata: {
        createdAt: now,
        updatedAt: now,
        version: '1.0.0',
        author: 'user',
        tags: []
      }
    }

    // Validate template
    await this.validateTemplate(newTemplate)

    // Encrypt sensitive configuration
    if (newTemplate.configuration.security) {
      const encrypted = await this.encryptSensitiveData(newTemplate.configuration)
      newTemplate.configuration = encrypted
    }

    this.customTemplates.set(id, newTemplate)

    await auditService.log({
      action: 'template.created',
      resourceId: id,
      resource: 'template',
      userId: 'user',
      details: {
        name: newTemplate.name,
        type: newTemplate.type
      }
    })

    return newTemplate
  }

  async updateTemplate(id: string, updates: Partial<FarmTemplate>): Promise<FarmTemplate> {
    const template = this.customTemplates.get(id)
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }

    const updatedTemplate: FarmTemplate = {
      ...template,
      ...updates,
      id, // Ensure ID doesn't change
      metadata: {
        ...template.metadata,
        ...updates.metadata,
        updatedAt: new Date(),
        version: this.incrementVersion(template.metadata.version)
      }
    }

    await this.validateTemplate(updatedTemplate)

    this.customTemplates.set(id, updatedTemplate)

    await auditService.log({
      action: 'template.updated',
      resourceId: id,
      resource: 'template',
      userId: 'user',
      details: {
        version: updatedTemplate.metadata.version
      }
    })

    return updatedTemplate
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = this.customTemplates.get(id)
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }

    this.customTemplates.delete(id)

    await auditService.log({
      action: 'template.deleted',
      resourceId: id,
      resource: 'template',
      userId: 'user',
      details: {
        name: template.name
      }
    })
  }

  async cloneTemplate(id: string, newName: string): Promise<FarmTemplate> {
    const sourceTemplate = this.getTemplate(id)
    if (!sourceTemplate) {
      throw new Error(`Template ${id} not found`)
    }

    const clonedTemplate = await this.createTemplate({
      ...sourceTemplate,
      name: newName,
      description: `Cloned from ${sourceTemplate.name}`
    })

    return clonedTemplate
  }

  private async validateTemplate(template: FarmTemplate): Promise<void> {
    // Validate resource allocation
    const totalAgentCpu = template.configuration.agents.reduce(
      (sum, agent) => sum + (agent.count * agent.resources.cpu),
      0
    )
    
    if (totalAgentCpu > template.configuration.resources.totalCpu) {
      throw new Error('Total agent CPU allocation exceeds available CPU')
    }

    // Validate agent configurations
    for (const agentConfig of template.configuration.agents) {
      if (agentConfig.count < 1) {
        throw new Error('Agent count must be at least 1')
      }

      if (agentConfig.capabilities.length === 0) {
        throw new Error('Agents must have at least one capability')
      }

      // Validate health check if present
      if (agentConfig.healthCheck) {
        const hc = agentConfig.healthCheck
        if (hc.interval < 1000) {
          throw new Error('Health check interval must be at least 1000ms')
        }
        if (hc.timeout >= hc.interval) {
          throw new Error('Health check timeout must be less than interval')
        }
      }
    }

    // Validate security configuration
    if (template.configuration.security.authentication.required) {
      if (template.configuration.security.authentication.methods.length === 0) {
        throw new Error('At least one authentication method must be specified')
      }
    }

    // Validate monitoring configuration
    if (template.configuration.monitoring.alerting.enabled) {
      if (template.configuration.monitoring.alerting.channels.length === 0) {
        throw new Error('At least one alert channel must be configured')
      }
    }
  }

  private async encryptSensitiveData(configuration: any): Promise<any> {
    const encrypted = { ...configuration }

    // Encrypt API keys and credentials in alert channels
    if (encrypted.monitoring?.alerting?.channels) {
      for (const channel of encrypted.monitoring.alerting.channels) {
        if (channel.configuration) {
          // Encrypt sensitive fields based on channel type
          switch (channel.type) {
            case 'slack':
              if (channel.configuration.webhookUrl) {
                channel.configuration.webhookUrl = await encryptionService.encrypt(
                  channel.configuration.webhookUrl
                )
              }
              break
            case 'email':
              if (channel.configuration.smtpPassword) {
                channel.configuration.smtpPassword = await encryptionService.encrypt(
                  channel.configuration.smtpPassword
                )
              }
              break
            case 'webhook':
              if (channel.configuration.secret) {
                channel.configuration.secret = await encryptionService.encrypt(
                  channel.configuration.secret
                )
              }
              break
          }
        }
      }
    }

    return encrypted
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.')
    const patch = parseInt(parts[2]) + 1
    return `${parts[0]}.${parts[1]}.${patch}`
  }

  getTemplate(id: string): FarmTemplate | undefined {
    return this.templates.get(id) || this.customTemplates.get(id)
  }

  getAllTemplates(): FarmTemplate[] {
    const builtIn = Array.from(this.templates.values())
    const custom = Array.from(this.customTemplates.values())
    return [...builtIn, ...custom]
  }

  getCustomTemplates(): FarmTemplate[] {
    return Array.from(this.customTemplates.values())
  }

  async exportTemplate(id: string): Promise<string> {
    const template = this.getTemplate(id)
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }

    // Remove sensitive data before export
    const exportData = {
      ...template,
      id: undefined, // Remove ID for portability
      metadata: {
        ...template.metadata,
        createdAt: undefined,
        updatedAt: undefined
      }
    }

    return JSON.stringify(exportData, null, 2)
  }

  async importTemplate(templateData: string): Promise<FarmTemplate> {
    try {
      const parsed = JSON.parse(templateData)
      
      // Validate structure
      if (!parsed.name || !parsed.type || !parsed.configuration) {
        throw new Error('Invalid template format')
      }

      return await this.createTemplate(parsed)
    } catch (error) {
      throw new Error(`Failed to import template: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async searchTemplates(query: {
    type?: FarmTemplate['type']
    tags?: string[]
    author?: string
  }): Promise<FarmTemplate[]> {
    let templates = this.getAllTemplates()

    if (query.type) {
      templates = templates.filter(t => t.type === query.type)
    }

    if (query.tags && query.tags.length > 0) {
      templates = templates.filter(t => 
        query.tags!.some(tag => t.metadata.tags.includes(tag))
      )
    }

    if (query.author) {
      templates = templates.filter(t => t.metadata.author === query.author)
    }

    return templates
  }

  async addTagToTemplate(id: string, tag: string): Promise<void> {
    const template = this.customTemplates.get(id)
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }

    if (!template.metadata.tags.includes(tag)) {
      template.metadata.tags.push(tag)
      template.metadata.updatedAt = new Date()
      
      await auditService.log({
        action: 'template.tagged',
        resourceId: id,
        resource: 'template',
        userId: 'user',
        details: { tag }
      })
    }
  }

  async removeTagFromTemplate(id: string, tag: string): Promise<void> {
    const template = this.customTemplates.get(id)
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }

    const index = template.metadata.tags.indexOf(tag)
    if (index > -1) {
      template.metadata.tags.splice(index, 1)
      template.metadata.updatedAt = new Date()
      
      await auditService.log({
        action: 'template.untagged',
        resourceId: id,
        resource: 'template',
        userId: 'user',
        details: { tag }
      })
    }
  }

  // Set built-in templates from farmOrchestrator
  setBuiltInTemplates(templates: FarmTemplate[]): void {
    this.templates.clear()
    templates.forEach(template => {
      this.templates.set(template.id, template)
    })
  }
}

export const templateService = new TemplateService()