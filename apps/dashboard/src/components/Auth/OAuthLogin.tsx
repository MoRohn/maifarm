import React from 'react';
import { motion } from 'framer-motion';
import { oauthService } from '@/services/oauth/oauthService';
import { OAuthProvider } from '@/types/oauth';

interface OAuthLoginProps {
  providers?: string[];
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export const OAuthLogin: React.FC<OAuthLoginProps> = ({
  providers,
  onSuccess,
  onError,
}) => {
  const [isLoading, setIsLoading] = React.useState<string | null>(null);
  const availableProviders = oauthService.getProviders();
  
  const displayProviders = providers
    ? availableProviders.filter(p => providers.includes(p.id))
    : availableProviders;

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    try {
      setIsLoading(provider.id);
      const authUrl = await oauthService.initiateAuthorization(provider.id);
      window.location.href = authUrl;
    } catch (error) {
      setIsLoading(null);
      onError?.(error as Error);
    }
  };

  if (displayProviders.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
            Or continue with
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {displayProviders.map((provider) => (
          <motion.button
            key={provider.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleOAuthLogin(provider)}
            disabled={isLoading !== null}
            className={`
              relative w-full flex items-center justify-center px-4 py-3 
              border border-gray-300 dark:border-gray-600 rounded-lg
              text-sm font-medium text-gray-700 dark:text-gray-200
              bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200
            `}
          >
            {isLoading === provider.id ? (
              <div className="absolute left-4">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-indigo-600" />
              </div>
            ) : (
              <div 
                className="absolute left-4" 
                dangerouslySetInnerHTML={{ __html: provider.icon || '' }}
              />
            )}
            <span>Continue with {provider.name}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
};