// Barrel export for Lucide React icons to ensure proper bundling
// This helps prevent WebKit internal errors when loading icons

export {
  // Shopping/Store icons
  ShoppingBasket,
  
  // Weather icons
  Wheat,
  
  // Navigation icons
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowUpRightSquare,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  
  // File/Folder icons
  Folder,
  FolderArchive,
  File,
  FileCode,
  Download,
  DownloadCloud,
  Upload,
  
  // Media icons
  Play,
  Pause,
  StopCircle,
  
  // UI/Action icons
  X,
  Plus,
  Minus,
  Check,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  HelpCircle,
  
  // Communication icons
  Send,
  Bell,
  BellRing,
  
  // System icons
  Settings,
  Cog,
  Terminal,
  Monitor,
  Cpu,
  HardDrive,
  Server,
  Database,
  
  // User/Team icons
  User,
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  
  // Status icons
  Activity,
  Zap,
  Power,
  Loader,
  RefreshCw,
  RotateCcw,
  
  // Time icons
  Clock,
  AlarmClock,
  AlarmClockMinus,
  Timer,
  TimerOff,
  
  // Nature/Farm icons
  Trees,
  Sprout,
  Flower,
  
  // Shape icons
  Circle,
  Square,
  EqualSquare,
  CircuitBoard,
  
  // Chart/Data icons
  BarChart,
  LineChart,
  PieChart,
  TrendingUp,
  TrendingDown,
  
  // Code/Development icons
  Code,
  Code2,
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  
  // Layout icons
  Grid,
  List,
  Layers,
  Layout,
  PanelBottom,
  
  // Security icons
  Shield,
  Lock,
  Unlock,
  Key,
  
  // Communication/Chat icons
  MessageCircle,
  MessageSquare,
  
  // Movement icons
  Move,
  MoveDiagonal,
  MoveDiagonal2,
  
  // Special icons
  Brain,
  Rocket,
  Sparkles,
  Star,
  Heart,
  Eye,
  EyeOff,
  
  // Tool icons
  Wrench,
  Hammer,
  
  // Edit icons
  Edit,
  Edit2,
  Edit3,
  Copy,
  Clipboard,
  
  // Device icons
  Smartphone,
  Tablet,
  Laptop,
  
  // Connection icons
  Wifi,
  WifiOff,
  Link,
  Unlink,
  
  // Volume icons
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  
  // Target icons
  Target,
  Crosshair,
  
  // Package icons
  Package,
  Box,
  Archive,
  
  // Math icons
  Plus as PlusIcon,
  Minus as MinusIcon,
  Divide,
  
  // More navigation
  Home,
  Search,
  Filter,
  
  // More UI elements
  Menu,
  MoreHorizontal,
  MoreVertical,
  
  // Task/Project icons
  ListChecks,
  CheckSquare,
  Square as SquareIcon,
  
  // Weather/Environment
  Sun,
  Moon,
  Cloud,
  CloudRain,
  
  // Money/Finance
  DollarSign,
  CreditCard,
  Wallet,
  
  // Travel/Location
  MapPin,
  Navigation,
  Compass,
  
  // Miscellaneous
  Coffee,
  Award,
  Flag,
  Bookmark,
  Hash,
  Percent,
  
  // Additional farm-related
  Tractor,
  
  // Command icon (for keyboard shortcuts)
  Command,
  
  // Maximum/Minimum
  Maximize,
  Maximize2,
  Minimize,
  Minimize2,
  
  // Fuel/Energy
  Fuel,
  Battery,
  BatteryCharging,
  
  // Strikethrough (for text formatting)
  Strikethrough,
  
  // Ungroup
  Ungroup,
  
  // Rocking chair
  RockingChair,
  
  // Panel icons
  PanelTop,
  PanelLeft,
  PanelRight,
  
  // Frame icons
  Frame,
  Framer,
  
  // Citrus
  Citrus,
  
  // Note icons
  StickyNote,
  NotebookPen,
  
  // Rotate icons
  RotateCw,
  
  // Signal icons
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  SignalZero,
} from 'lucide-react';

// Re-export all icons as a namespace for convenience
import * as LucideIcons from 'lucide-react';
export { LucideIcons };

// Helper function to dynamically get an icon by name
export const getIconByName = (name: string) => {
  return (LucideIcons as any)[name];
};