export interface Translation {
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    create: string;
    search: string;
    loading: string;
    error: string;
    success: string;
    close: string;
    back: string;
    next: string;
    previous: string;
    confirm: string;
    yes: string;
    no: string;
  };
  dashboard: {
    title: string;
    welcome: string;
    activeFarms: string;
    totalAgents: string;
    tasksCompleted: string;
    successRate: string;
    createFarm: string;
    viewAllFarms: string;
    recentActivity: string;
    noActivity: string;
  };
  farms: {
    title: string;
    create: string;
    active: string;
    completed: string;
    failed: string;
    paused: string;
    agents: string;
    duration: string;
    progress: string;
    noFarms: string;
    startFarm: string;
    stopFarm: string;
    pauseFarm: string;
    resumeFarm: string;
    viewDetails: string;
  };
  settings: {
    title: string;
    theme: string;
    language: string;
    notifications: string;
    security: string;
    api: string;
    templates: string;
    ai: string;
    appearance: string;
    general: string;
    advanced: string;
    about: string;
    version: string;
    updates: string;
    help: string;
    feedback: string;
  };
  goWild: {
    title: string;
    description: string;
    start: string;
    pause: string;
    resume: string;
    stop: string;
    exploring: string;
    paused: string;
    completed: string;
    creativity: string;
    boundaries: string;
    discoveries: string;
    saveDiscovery: string;
    discardDiscovery: string;
    noDiscoveries: string;
    stats: {
      nodesExplored: string;
      discoveriesMade: string;
      backtrackCount: string;
      avgCreativity: string;
    };
  };
  templates: {
    title: string;
    create: string;
    import: string;
    export: string;
    aiGenerated: string;
    popular: string;
    custom: string;
    useTemplate: string;
    preview: string;
    duplicate: string;
    estimatedTime: string;
    agents: string;
    steps: string;
    tags: string;
    noTemplates: string;
  };
  errors: {
    generic: string;
    network: string;
    unauthorized: string;
    notFound: string;
    validation: string;
    serverError: string;
    timeout: string;
    retry: string;
  };
}

const translations: Record<string, Translation> = {
  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      create: 'Create',
      search: 'Search',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      close: 'Close',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      confirm: 'Confirm',
      yes: 'Yes',
      no: 'No'
    },
    dashboard: {
      title: 'Dashboard',
      welcome: 'Welcome back',
      activeFarms: 'Active Farms',
      totalAgents: 'Total Agents',
      tasksCompleted: 'Tasks Completed',
      successRate: 'Success Rate',
      createFarm: 'Create New Farm',
      viewAllFarms: 'View All Farms',
      recentActivity: 'Recent Activity',
      noActivity: 'No recent activity'
    },
    farms: {
      title: 'Farms',
      create: 'Create Farm',
      active: 'Active',
      completed: 'Completed',
      failed: 'Failed',
      paused: 'Paused',
      agents: 'agents',
      duration: 'Duration',
      progress: 'Progress',
      noFarms: 'No farms found',
      startFarm: 'Start Farm',
      stopFarm: 'Stop Farm',
      pauseFarm: 'Pause Farm',
      resumeFarm: 'Resume Farm',
      viewDetails: 'View Details'
    },
    settings: {
      title: 'Settings',
      theme: 'Theme',
      language: 'Language',
      notifications: 'Notifications',
      security: 'Security',
      api: 'API Keys',
      templates: 'Templates',
      ai: 'AI Assistant',
      appearance: 'Appearance',
      general: 'General',
      advanced: 'Advanced',
      about: 'About',
      version: 'Version',
      updates: 'Updates',
      help: 'Help',
      feedback: 'Feedback'
    },
    goWild: {
      title: 'Go Wild Mode',
      description: 'Let agents explore creative solutions autonomously',
      start: 'Start Exploration',
      pause: 'Pause',
      resume: 'Resume',
      stop: 'Stop',
      exploring: 'Exploring new possibilities...',
      paused: 'Exploration paused',
      completed: 'Exploration completed',
      creativity: 'Creativity Level',
      boundaries: 'Boundaries',
      discoveries: 'Discoveries',
      saveDiscovery: 'Save Discovery',
      discardDiscovery: 'Discard',
      noDiscoveries: 'No discoveries yet',
      stats: {
        nodesExplored: 'Nodes Explored',
        discoveriesMade: 'Discoveries',
        backtrackCount: 'Backtracks',
        avgCreativity: 'Avg Creativity'
      }
    },
    templates: {
      title: 'Farm Templates',
      create: 'Create Template',
      import: 'Import Template',
      export: 'Export',
      aiGenerated: 'AI Generated',
      popular: 'Popular',
      custom: 'Custom',
      useTemplate: 'Use Template',
      preview: 'Preview',
      duplicate: 'Duplicate',
      estimatedTime: 'Estimated Time',
      agents: 'Agents',
      steps: 'Steps',
      tags: 'Tags',
      noTemplates: 'No templates available'
    },
    errors: {
      generic: 'An error occurred',
      network: 'Network error',
      unauthorized: 'Unauthorized',
      notFound: 'Not found',
      validation: 'Validation error',
      serverError: 'Server error',
      timeout: 'Request timeout',
      retry: 'Retry'
    }
  },
  es: {
    common: {
      save: 'Guardar',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      edit: 'Editar',
      create: 'Crear',
      search: 'Buscar',
      loading: 'Cargando...',
      error: 'Error',
      success: 'Éxito',
      close: 'Cerrar',
      back: 'Atrás',
      next: 'Siguiente',
      previous: 'Anterior',
      confirm: 'Confirmar',
      yes: 'Sí',
      no: 'No'
    },
    dashboard: {
      title: 'Panel de control',
      welcome: 'Bienvenido de nuevo',
      activeFarms: 'Granjas Activas',
      totalAgents: 'Agentes Totales',
      tasksCompleted: 'Tareas Completadas',
      successRate: 'Tasa de Éxito',
      createFarm: 'Crear Nueva Granja',
      viewAllFarms: 'Ver Todas las Granjas',
      recentActivity: 'Actividad Reciente',
      noActivity: 'Sin actividad reciente'
    },
    farms: {
      title: 'Granjas',
      create: 'Crear Granja',
      active: 'Activa',
      completed: 'Completada',
      failed: 'Fallida',
      paused: 'Pausada',
      agents: 'agentes',
      duration: 'Duración',
      progress: 'Progreso',
      noFarms: 'No se encontraron granjas',
      startFarm: 'Iniciar Granja',
      stopFarm: 'Detener Granja',
      pauseFarm: 'Pausar Granja',
      resumeFarm: 'Reanudar Granja',
      viewDetails: 'Ver Detalles'
    },
    settings: {
      title: 'Configuración',
      theme: 'Tema',
      language: 'Idioma',
      notifications: 'Notificaciones',
      security: 'Seguridad',
      api: 'Claves API',
      templates: 'Plantillas',
      ai: 'Asistente IA',
      appearance: 'Apariencia',
      general: 'General',
      advanced: 'Avanzado',
      about: 'Acerca de',
      version: 'Versión',
      updates: 'Actualizaciones',
      help: 'Ayuda',
      feedback: 'Comentarios'
    },
    goWild: {
      title: 'Modo Go Wild',
      description: 'Permite a los agentes explorar soluciones creativas de forma autónoma',
      start: 'Iniciar Exploración',
      pause: 'Pausar',
      resume: 'Reanudar',
      stop: 'Detener',
      exploring: 'Explorando nuevas posibilidades...',
      paused: 'Exploración pausada',
      completed: 'Exploración completada',
      creativity: 'Nivel de Creatividad',
      boundaries: 'Límites',
      discoveries: 'Descubrimientos',
      saveDiscovery: 'Guardar Descubrimiento',
      discardDiscovery: 'Descartar',
      noDiscoveries: 'Sin descubrimientos aún',
      stats: {
        nodesExplored: 'Nodos Explorados',
        discoveriesMade: 'Descubrimientos',
        backtrackCount: 'Retrocesos',
        avgCreativity: 'Creatividad Promedio'
      }
    },
    templates: {
      title: 'Plantillas de Granja',
      create: 'Crear Plantilla',
      import: 'Importar Plantilla',
      export: 'Exportar',
      aiGenerated: 'Generado por IA',
      popular: 'Popular',
      custom: 'Personalizado',
      useTemplate: 'Usar Plantilla',
      preview: 'Vista Previa',
      duplicate: 'Duplicar',
      estimatedTime: 'Tiempo Estimado',
      agents: 'Agentes',
      steps: 'Pasos',
      tags: 'Etiquetas',
      noTemplates: 'No hay plantillas disponibles'
    },
    errors: {
      generic: 'Ocurrió un error',
      network: 'Error de red',
      unauthorized: 'No autorizado',
      notFound: 'No encontrado',
      validation: 'Error de validación',
      serverError: 'Error del servidor',
      timeout: 'Tiempo de espera agotado',
      retry: 'Reintentar'
    }
  },
  fr: {
    common: {
      save: 'Enregistrer',
      cancel: 'Annuler',
      delete: 'Supprimer',
      edit: 'Modifier',
      create: 'Créer',
      search: 'Rechercher',
      loading: 'Chargement...',
      error: 'Erreur',
      success: 'Succès',
      close: 'Fermer',
      back: 'Retour',
      next: 'Suivant',
      previous: 'Précédent',
      confirm: 'Confirmer',
      yes: 'Oui',
      no: 'Non'
    },
    dashboard: {
      title: 'Tableau de bord',
      welcome: 'Bon retour',
      activeFarms: 'Fermes Actives',
      totalAgents: 'Agents Totaux',
      tasksCompleted: 'Tâches Terminées',
      successRate: 'Taux de Réussite',
      createFarm: 'Créer une Nouvelle Ferme',
      viewAllFarms: 'Voir Toutes les Fermes',
      recentActivity: 'Activité Récente',
      noActivity: 'Aucune activité récente'
    },
    farms: {
      title: 'Fermes',
      create: 'Créer une Ferme',
      active: 'Active',
      completed: 'Terminée',
      failed: 'Échouée',
      paused: 'En Pause',
      agents: 'agents',
      duration: 'Durée',
      progress: 'Progression',
      noFarms: 'Aucune ferme trouvée',
      startFarm: 'Démarrer la Ferme',
      stopFarm: 'Arrêter la Ferme',
      pauseFarm: 'Mettre en Pause',
      resumeFarm: 'Reprendre',
      viewDetails: 'Voir les Détails'
    },
    settings: {
      title: 'Paramètres',
      theme: 'Thème',
      language: 'Langue',
      notifications: 'Notifications',
      security: 'Sécurité',
      api: 'Clés API',
      templates: 'Modèles',
      ai: 'Assistant IA',
      appearance: 'Apparence',
      general: 'Général',
      advanced: 'Avancé',
      about: 'À propos',
      version: 'Version',
      updates: 'Mises à jour',
      help: 'Aide',
      feedback: 'Commentaires'
    },
    goWild: {
      title: 'Mode Go Wild',
      description: 'Laissez les agents explorer des solutions créatives de manière autonome',
      start: 'Démarrer l\'Exploration',
      pause: 'Pause',
      resume: 'Reprendre',
      stop: 'Arrêter',
      exploring: 'Explorer de nouvelles possibilités...',
      paused: 'Exploration en pause',
      completed: 'Exploration terminée',
      creativity: 'Niveau de Créativité',
      boundaries: 'Limites',
      discoveries: 'Découvertes',
      saveDiscovery: 'Enregistrer la Découverte',
      discardDiscovery: 'Ignorer',
      noDiscoveries: 'Aucune découverte pour le moment',
      stats: {
        nodesExplored: 'Nœuds Explorés',
        discoveriesMade: 'Découvertes',
        backtrackCount: 'Retours en Arrière',
        avgCreativity: 'Créativité Moyenne'
      }
    },
    templates: {
      title: 'Modèles de Ferme',
      create: 'Créer un Modèle',
      import: 'Importer un Modèle',
      export: 'Exporter',
      aiGenerated: 'Généré par IA',
      popular: 'Populaire',
      custom: 'Personnalisé',
      useTemplate: 'Utiliser le Modèle',
      preview: 'Aperçu',
      duplicate: 'Dupliquer',
      estimatedTime: 'Temps Estimé',
      agents: 'Agents',
      steps: 'Étapes',
      tags: 'Tags',
      noTemplates: 'Aucun modèle disponible'
    },
    errors: {
      generic: 'Une erreur s\'est produite',
      network: 'Erreur réseau',
      unauthorized: 'Non autorisé',
      notFound: 'Non trouvé',
      validation: 'Erreur de validation',
      serverError: 'Erreur serveur',
      timeout: 'Délai d\'attente dépassé',
      retry: 'Réessayer'
    }
  }
};

class I18nService {
  private currentLanguage: string = 'en';
  private translations = translations;
  
  setLanguage(languageCode: string) {
    if (this.translations[languageCode]) {
      this.currentLanguage = languageCode;
      document.documentElement.lang = languageCode;
      
      // Handle RTL languages
      const rtlLanguages = ['ar', 'he'];
      if (rtlLanguages.includes(languageCode)) {
        document.documentElement.dir = 'rtl';
      } else {
        document.documentElement.dir = 'ltr';
      }
    }
  }
  
  getLanguage(): string {
    return this.currentLanguage;
  }
  
  t(key: string): string {
    const keys = key.split('.');
    let value: any = this.translations[this.currentLanguage];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English
        value = this.translations['en'];
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object' && fallbackKey in value) {
            value = value[fallbackKey];
          } else {
            return key; // Return key if translation not found
          }
        }
        break;
      }
    }
    
    return typeof value === 'string' ? value : key;
  }
  
  // Shorthand for common translations
  get common() {
    return this.translations[this.currentLanguage].common;
  }
  
  get dashboard() {
    return this.translations[this.currentLanguage].dashboard;
  }
  
  get farms() {
    return this.translations[this.currentLanguage].farms;
  }
  
  get settings() {
    return this.translations[this.currentLanguage].settings;
  }
  
  get goWild() {
    return this.translations[this.currentLanguage].goWild;
  }
  
  get templates() {
    return this.translations[this.currentLanguage].templates;
  }
  
  get errors() {
    return this.translations[this.currentLanguage].errors;
  }
}

export const i18n = new I18nService();