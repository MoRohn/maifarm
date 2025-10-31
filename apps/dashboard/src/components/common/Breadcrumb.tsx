import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import { motion } from 'framer-motion'
import clsx from 'clsx'

interface BreadcrumbItem {
  label: string
  href?: string
  icon?: React.ReactNode
}

const routeLabels: Record<string, string> = {
  home: 'Dashboard',
  farmers: 'Farmers',
  barn: 'Barn',
  analytics: 'Analytics',
  harvests: 'Harvests',
  settings: 'Settings',
  'quick-task': 'Quick Task',
  'go-wild': 'Go Wild Mode',
  'yaml-generator': 'YAML Generator',
}

export function Breadcrumb() {
  const location = useLocation()
  const pathSegments = location.pathname.split('/').filter(Boolean)
  
  // Generate breadcrumb items from path
  const items: BreadcrumbItem[] = [
    { label: 'Home', href: '/home', icon: <Home className="h-4 w-4" /> }
  ]
  
  let currentPath = ''
  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`
    const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1)
    
    // Don't add a link for the last item (current page)
    const isLast = index === pathSegments.length - 1
    items.push({
      label,
      href: isLast ? undefined : currentPath
    })
  })
  
  // Don't show breadcrumbs if we're on the home page
  if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === 'home')) {
    return null
  }
  
  return (
    <nav 
      className="flex items-center space-x-2 px-6 py-3 text-sm"
      aria-label="Breadcrumb"
    >
      {items.map((item, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex items-center"
        >
          {index > 0 && (
            <ChevronRight className="h-4 w-4 mx-2 text-gray-400 dark:text-gray-600" />
          )}
          
          {item.href ? (
            <Link
              to={item.href}
              className={clsx(
                'flex items-center space-x-1.5 rounded-lg px-2 py-1 transition-all duration-200',
                'hover:bg-gray-100 dark:hover:bg-gray-800',
                'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900'
              )}
              aria-label={`Navigate to ${item.label}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ) : (
            <div 
              className="flex items-center space-x-1.5 px-2 py-1 font-medium text-gray-900 dark:text-gray-100"
              aria-current="page"
            >
              {item.icon}
              <span>{item.label}</span>
            </div>
          )}
        </motion.div>
      ))}
    </nav>
  )
}