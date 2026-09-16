import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { GlassButton } from './GlassButton';
import { GlassToggle } from './GlassToggle';
import { GlassModal } from './GlassModal';
import {
  Save,
  Trash2,
  CheckCircle,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';

/**
 * GlassShowcase - Interactive demonstration of all glassy UI components
 *
 * This component showcases:
 * - GlassCard with different configurations
 * - GlassButton with all variants and sizes
 * - GlassToggle with different sizes
 * - GlassModal with confirmation dialog
 *
 * Usage: Import and render in a page to see all components in action
 *
 * Example:
 * ```tsx
 * import { GlassShowcase } from '@/components/UI/GlassShowcase';
 *
 * function DemoPage() {
 *   return <GlassShowcase />;
 * }
 * ```
 */
export const GlassShowcase: React.FC = () => {
  const [toggle1, setToggle1] = useState(false);
  const [toggle2, setToggle2] = useState(true);
  const [toggle3, setToggle3] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSave = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      toast.success('Changes saved successfully!');
    }, 2000);
  };

  const handleDelete = () => {
    setShowModal(true);
  };

  const confirmDelete = () => {
    setShowModal(false);
    toast.success('Item deleted successfully!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <GlassCard>
          <div className="flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-3xl font-bold text-white">
                Glassy UI Components Showcase
              </h1>
              <p className="text-gray-400 mt-1">
                Beautiful Apple-like glass morphism components
              </p>
            </div>
          </div>
        </GlassCard>

        {/* Buttons Section */}
        <GlassCard>
          <h2 className="text-2xl font-bold text-white mb-6">Buttons</h2>

          {/* Variants */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                Variants
              </h3>
              <div className="flex flex-wrap gap-3">
                <GlassButton variant="primary" onClick={() => toast.success('Primary clicked!')}>
                  Primary Button
                </GlassButton>
                <GlassButton variant="secondary" onClick={() => toast.info('Secondary clicked!')}>
                  Secondary Button
                </GlassButton>
                <GlassButton variant="danger" onClick={() => toast.error('Danger clicked!')}>
                  Danger Button
                </GlassButton>
                <GlassButton variant="success" onClick={() => toast.success('Success clicked!')}>
                  Success Button
                </GlassButton>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">Sizes</h3>
              <div className="flex flex-wrap items-center gap-3">
                <GlassButton variant="primary" size="sm">
                  Small
                </GlassButton>
                <GlassButton variant="primary" size="md">
                  Medium
                </GlassButton>
                <GlassButton variant="primary" size="lg">
                  Large
                </GlassButton>
              </div>
            </div>

            {/* With Icons */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                With Icons
              </h3>
              <div className="flex flex-wrap gap-3">
                <GlassButton
                  variant="primary"
                  icon={<Save className="w-4 h-4" />}
                  onClick={handleSave}
                  loading={loading}
                >
                  Save Changes
                </GlassButton>
                <GlassButton
                  variant="success"
                  icon={<CheckCircle className="w-4 h-4" />}
                >
                  Confirm
                </GlassButton>
                <GlassButton
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                  onClick={handleDelete}
                >
                  Delete
                </GlassButton>
              </div>
            </div>

            {/* States */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                States
              </h3>
              <div className="flex flex-wrap gap-3">
                <GlassButton variant="primary" disabled>
                  Disabled
                </GlassButton>
                <GlassButton variant="primary" loading>
                  Loading
                </GlassButton>
                <GlassButton variant="primary" fullWidth>
                  Full Width
                </GlassButton>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Toggles Section */}
        <GlassCard>
          <h2 className="text-2xl font-bold text-white mb-6">Toggles</h2>

          <div className="space-y-4">
            {/* Sizes */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">Sizes</h3>
              <div className="space-y-3">
                <GlassToggle
                  checked={toggle1}
                  onChange={setToggle1}
                  label="Small Toggle"
                  size="sm"
                />
                <GlassToggle
                  checked={toggle2}
                  onChange={setToggle2}
                  label="Medium Toggle (Default)"
                  size="md"
                />
                <GlassToggle
                  checked={toggle3}
                  onChange={setToggle3}
                  label="Large Toggle"
                  size="lg"
                />
              </div>
            </div>

            {/* States */}
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">
                States
              </h3>
              <div className="space-y-3">
                <GlassToggle
                  checked={true}
                  onChange={() => {}}
                  label="Disabled (On)"
                  disabled
                />
                <GlassToggle
                  checked={false}
                  onChange={() => {}}
                  label="Disabled (Off)"
                  disabled
                />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <GlassCard>
            <h3 className="text-lg font-bold text-white mb-2">Static Card</h3>
            <p className="text-gray-400 text-sm">
              This is a basic glass card without hover effects.
            </p>
          </GlassCard>

          <GlassCard hover>
            <h3 className="text-lg font-bold text-white mb-2">Hover Card</h3>
            <p className="text-gray-400 text-sm">
              This card has a subtle hover effect. Try hovering over it!
            </p>
          </GlassCard>

          <GlassCard hover onClick={() => toast.info('Card clicked!')}>
            <h3 className="text-lg font-bold text-white mb-2">
              Clickable Card
            </h3>
            <p className="text-gray-400 text-sm">
              This card is interactive. Click it to see a toast notification!
            </p>
          </GlassCard>
        </div>

        {/* Form Example */}
        <GlassCard>
          <h2 className="text-2xl font-bold text-white mb-6">Form Example</h2>

          <div className="space-y-4">
            {/* Text Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                placeholder="John Doe"
                className="w-full px-4 py-3 rounded-xl backdrop-blur-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition-all duration-300"
              />
            </div>

            {/* Email Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                placeholder="john@example.com"
                className="w-full px-4 py-3 rounded-xl backdrop-blur-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition-all duration-300"
              />
            </div>

            {/* Textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Message
              </label>
              <textarea
                rows={4}
                placeholder="Enter your message..."
                className="w-full px-4 py-3 rounded-xl backdrop-blur-xl bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-4 focus:ring-blue-500/50 transition-all duration-300 resize-none"
              />
            </div>

            {/* Toggle */}
            <GlassToggle
              checked={toggle1}
              onChange={setToggle1}
              label="Subscribe to newsletter"
            />

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <GlassButton
                variant="primary"
                icon={<Save className="w-4 h-4" />}
                onClick={handleSave}
                loading={loading}
                fullWidth
              >
                Save Changes
              </GlassButton>
              <GlassButton
                variant="secondary"
                onClick={() => toast.info('Cancelled')}
              >
                Cancel
              </GlassButton>
            </div>
          </div>
        </GlassCard>

        {/* Modal Trigger */}
        <GlassCard>
          <h2 className="text-2xl font-bold text-white mb-4">Modal Example</h2>
          <p className="text-gray-400 mb-4">
            Click the button below to see a modal with glass effects.
          </p>
          <GlassButton
            variant="primary"
            onClick={() => setShowModal(true)}
          >
            Open Modal
          </GlassButton>
        </GlassCard>
      </div>

      {/* Modal */}
      <GlassModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Confirm Delete"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-300">
              <p className="font-medium text-white mb-1">
                Are you sure you want to delete this item?
              </p>
              <p>
                This action cannot be undone. All associated data will be
                permanently removed from the system.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <GlassButton
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={confirmDelete}
              fullWidth
            >
              Delete
            </GlassButton>
            <GlassButton
              variant="secondary"
              onClick={() => setShowModal(false)}
              fullWidth
            >
              Cancel
            </GlassButton>
          </div>
        </div>
      </GlassModal>
    </div>
  );
};
