import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Home,
  Users,
  Warehouse,
  BarChart3,
  Settings,
  Plus,
  Wheat,
  Rocket,
  FileCode,
  Command,
  ArrowRight,
  X
} from 'lucide-react'
import clsx from 'clsx'
import { useFarmStore } from '@/store/farmStore'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
  category: string
  keywords?: string[]
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { farms } = useFarmStore()

  // Define all available commands
  const commands = useMemo<CommandItem[]>(() => {
    const baseCommands: CommandItem[] = [
      {
        id: 'navigate-home',
        label: 'Go to Dashboard',
        description: 'Navigate to the home dashboard',
        icon: <Home className="h-4 w-4" />,
        action: () => {
          navigate('/home')
          setIsOpen(false)
        },
        category: 'Navigation',
        keywords: ['home', 'dashboard', 'main']
      },
      {
        id: 'navigate-farmers',
        label: 'View Farmers',
        description: 'Browse available farmer templates',
        icon: <Users className="h-4 w-4" />,
        action: () => {
          navigate('/farmers')
          setIsOpen(false)
        },
        category: 'Navigation',
        keywords: ['agents', 'templates']
      },
      {
        id: 'navigate-barn',
        label: 'Open Barn',
        description: 'View completed harvests',
        icon: <Warehouse className="h-4 w-4" />,
        action: () => {
          navigate('/barn')
          setIsOpen(false)
        },
        category: 'Navigation',
        keywords: ['storage', 'harvests', 'completed']
      },
      {
        id: 'navigate-analytics',
        label: 'Analytics Dashboard',
        description: 'View performance metrics',
        icon: <BarChart3 className="h-4 w-4" />,
        action: () => {
          navigate('/analytics')
          setIsOpen(false)
        },
        category: 'Navigation',
        keywords: ['metrics', 'performance', 'stats']
      },
      {
        id: 'navigate-settings',
        label: 'Settings',
        description: 'Configure application settings',
        icon: <Settings className="h-4 w-4" />,
        action: () => {
          navigate('/settings')
          setIsOpen(false)
        },
        category: 'Navigation',
        keywords: ['preferences', 'config', 'options']
      },
      {
        id: 'create-farm',
        label: 'Create New Farm',
        description: 'Start a new multi-agent farm',
        icon: <Plus className="h-4 w-4" />,
        action: () => {
          navigate('/home')
          // Trigger farm creation modal
          const event = new CustomEvent('openFarmCreator')
          window.dispatchEvent(event)
          setIsOpen(false)
        },
        category: 'Actions',
        keywords: ['new', 'add', 'start']
      },
      {
        id: 'quick-task',
        label: 'Quick Task',
        description: 'Execute a quick AI task',
        icon: <Rocket className="h-4 w-4" />,
        action: () => {
          const event = new CustomEvent('openQuickTask')
          window.dispatchEvent(event)
          setIsOpen(false)
        },
        category: 'Actions',
        keywords: ['fast', 'quick', 'instant']
      },
      {
        id: 'go-wild',
        label: 'Go Wild Mode',
        description: 'Enable autonomous exploration',
        icon: <Rocket className="h-4 w-4" />,
        action: () => {
          const event = new CustomEvent('openGoWild')
          window.dispatchEvent(event)
          setIsOpen(false)
        },
        category: 'Actions',
        keywords: ['autonomous', 'explore', 'creative']
      },
      {
        id: 'yaml-generator',
        label: 'YAML Generator',
        description: 'Create agent configurations',
        icon: <FileCode className="h-4 w-4" />,
        action: () => {
          navigate('/yaml-generator')
          setIsOpen(false)
        },
        category: 'Tools',
        keywords: ['config', 'yaml', 'generate']
      }
    ]

    // Add farm-specific commands
    const farmCommands: CommandItem[] = farms
      .filter(farm => farm && farm.id && farm.name && typeof farm.name === 'string') // Filter out invalid farms
      .map(farm => ({
        id: `farm-${farm.id}`,
        label: farm.name,
        description: `View harvest for ${farm.name}`,
        icon: <Wheat className="h-4 w-4" />,
        action: () => {
          navigate(`/harvest/${farm.id}`)
          setIsOpen(false)
        },
        category: 'Farms',
        keywords: ['farm', 'harvest', ...(typeof farm.name === 'string' ? [farm.name.toLowerCase()] : [])]
      }))

    return [...baseCommands, ...farmCommands]
  }, [farms, navigate])

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search) return commands

    const searchLower = search.toLowerCase()
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.keywords?.some(k => k.includes(searchLower))
    )
  }, [commands, search])

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  // Flatten commands for keyboard navigation
  const flatCommands = useMemo(() => {
    return Object.values(groupedCommands).flat()
  }, [groupedCommands])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open command palette with Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setSearch('')
        setSelectedIndex(0)
      }

      // Close with Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }

      // Navigate with arrow keys
      if (isOpen && flatCommands.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSelectedIndex(prev => (prev + 1) % flatCommands.length)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSelectedIndex(prev => (prev - 1 + flatCommands.length) % flatCommands.length)
        } else if (e.key === 'Enter') {
          e.preventDefault()
          flatCommands[selectedIndex]?.action()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, flatCommands, selectedIndex])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-gray-900/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />

          {/* Command Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className="fixed left-1/2 top-20 z-[110] w-full max-w-2xl -translate-x-1/2 px-4"
          >
            <div className="overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-gray-900/10 dark:ring-white/10">
              {/* Search Input */}
              <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-4">
                <Search className="h-5 w-5 text-gray-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent px-3 py-4 text-sm placeholder-gray-400 focus:outline-none"
                  aria-label="Command search"
                />
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Close command palette"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              {/* Command List */}
              <div className="max-h-96 overflow-y-auto p-2">
                {Object.entries(groupedCommands).length > 0 ? (
                  Object.entries(groupedCommands).map(([category, items]) => (
                    <div key={category} className="mb-2">
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {category}
                      </div>
                      {items.map((item, idx) => {
                        const globalIndex = flatCommands.indexOf(item)
                        const isSelected = globalIndex === selectedIndex
                        return (
                          <button
                            key={item.id}
                            onClick={item.action}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                            className={clsx(
                              'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors',
                              isSelected
                                ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                            )}
                          >
                            <div className="flex items-center space-x-3">
                              <div className={clsx(
                                'flex h-8 w-8 items-center justify-center rounded-lg',
                                isSelected
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                              )}>
                                {item.icon}
                              </div>
                              <div>
                                <div className="text-sm font-medium">
                                  {item.label}
                                </div>
                                {item.description && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {item.description}
                                  </div>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <ArrowRight className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    No commands found for "{search}"
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center space-x-1">
                      <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 font-mono text-xs">↑↓</kbd>
                      <span>Navigate</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 font-mono text-xs">↵</kbd>
                      <span>Select</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 font-mono text-xs">esc</kbd>
                      <span>Close</span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Command className="h-3 w-3" />
                    <span>+</span>
                    <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 font-mono text-xs">K</kbd>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}