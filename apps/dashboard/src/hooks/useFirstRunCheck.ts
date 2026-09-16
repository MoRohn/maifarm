import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useUserStore } from '@/store/userStore';
import { authService } from '@/services/auth';

interface FirstRunState {
  needsOnboarding: boolean;
  isChecking: boolean;
  shouldShowWelcome: boolean;
}

interface FirstRunOptions {
  disableNavigation?: boolean;
}

export const useFirstRunCheck = (options?: FirstRunOptions) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { preferences } = useUserStore();
  const hasNavigatedRef = useRef(false);
  const disableNavigation = options?.disableNavigation ?? false;

  const [state, setState] = useState<FirstRunState>({
    needsOnboarding: false,
    isChecking: true,
    shouldShowWelcome: false
  });

  useEffect(() => {
    // Early exit if already navigated
    if (hasNavigatedRef.current) {
      setState({ needsOnboarding: false, isChecking: false, shouldShowWelcome: false });
      return;
    }

    // Don't check if we're already on onboarding pages
    if (location.pathname === '/welcome' ||
        location.pathname === '/onboarding' ||
        location.pathname === '/initialization' ||
        location.pathname === '/login') {
      setState({ needsOnboarding: false, isChecking: false, shouldShowWelcome: false });
      // Clear the redirect flag when on onboarding pages
      sessionStorage.removeItem('maifarm-redirecting-to-welcome');
      hasNavigatedRef.current = false;
      return;
    }

    // Check for redirect loop prevention flag
    const isRedirecting = sessionStorage.getItem('maifarm-redirecting-to-welcome');
    if (isRedirecting === 'true') {
      console.warn('[FirstRunCheck] Redirect loop detected, skipping navigation');
      setState({ needsOnboarding: false, isChecking: false, shouldShowWelcome: false });
      sessionStorage.removeItem('maifarm-redirecting-to-welcome');
      return;
    }

    const checkFirstRun = async () => {
      try {
        const setupStatus = await authService.getSetupStatus();

        // Check if this is a completely fresh installation
        const isInitialized = localStorage.getItem('maifarm:initialized');
        const firstRunComplete = localStorage.getItem('maifarm:first-run-complete');
        const hasSeenWelcome = localStorage.getItem('maifarm:welcome-page:v2');

        const userWelcomeFlag = user?.id ? localStorage.getItem(`maifarm-show-welcome-${user.id}`) : null;

        // CRITICAL FIX: Don't redirect authenticated users if frontend initialization is complete
        // This prevents redirect loops when backend requiresSetup=true but user is already logged in
        const hasCompletedFrontendSetup = isInitialized === 'true' || firstRunComplete === 'true' || hasSeenWelcome === 'viewed';

        // Only require onboarding if backend says setup is needed AND frontend hasn't completed setup
        // AND user is not already authenticated with completed setup
        const needsOnboarding = setupStatus.requiresSetup && !hasCompletedFrontendSetup && !isAuthenticated;

        let shouldShowWelcome = false;

        if (!needsOnboarding) {
          if (userWelcomeFlag === 'true') {
            shouldShowWelcome = true;
            if (user?.id) {
              localStorage.removeItem(`maifarm-show-welcome-${user.id}`);
            }
          } else if (!firstRunComplete && !hasSeenWelcome && !hasCompletedFrontendSetup) {
            shouldShowWelcome = true;
          }
        }

        // Check if user needs to configure API keys
        const needsApiSetup = !preferences?.apiKeys ||
                             Object.keys(preferences.apiKeys || {}).length === 0;

        setState({
          needsOnboarding,
          isChecking: false,
          shouldShowWelcome
        });

        // Navigate if needed - check ref again to prevent race conditions
        if (!disableNavigation && !hasNavigatedRef.current && location.pathname !== '/welcome') {
          if (needsOnboarding) {
            hasNavigatedRef.current = true;
            sessionStorage.setItem('maifarm-redirecting-to-welcome', 'true');
            console.log('[FirstRunCheck] Navigating to /welcome for onboarding');

            // Use setTimeout to prevent re-render loop
            setTimeout(() => {
              navigate('/welcome', { replace: true });
              // Clear the flag after navigation completes
              setTimeout(() => {
                sessionStorage.removeItem('maifarm-redirecting-to-welcome');
                hasNavigatedRef.current = false;
              }, 500);
            }, 0);
            return;
          }

          if (needsApiSetup && location.pathname !== '/settings') {
            console.info('API keys not configured. Consider setting up in Settings.');
          }
        }
      } catch (error) {
        console.error('[FirstRunCheck] Error during check:', error);
        setState({ needsOnboarding: false, isChecking: false, shouldShowWelcome: false });
      }
    };

    // Only run check if we're authenticated and not on excluded pages
    const shouldRunCheck = isAuthenticated &&
      location.pathname !== '/welcome' &&
      location.pathname !== '/onboarding' &&
      location.pathname !== '/initialization' &&
      location.pathname !== '/login';

    if (!shouldRunCheck) {
      setState({ needsOnboarding: false, isChecking: false, shouldShowWelcome: false });
      return;
    }

    // Small delay to prevent flash
    const timer = setTimeout(checkFirstRun, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAuthenticated, disableNavigation]);

  return state;
};

export const useInitializationRedirect = () => {
  const navigate = useNavigate();

  const redirectToInitialization = () => {
    localStorage.removeItem('maifarm:initialized');
    localStorage.removeItem('maifarm:first-run-complete');
    navigate('/initialization');
  };

  const skipInitialization = () => {
    localStorage.setItem('maifarm:initialized', 'true');
    localStorage.setItem('maifarm:first-run-complete', 'true');
  };

  return {
    redirectToInitialization,
    skipInitialization
  };
};
