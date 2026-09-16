import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Message } from '@/components/Chat/ChatMessage';
import { ChatMode } from '@/components/Chat/GlassmorphicChatModal';
import { aiChatService } from '@/services/aiChatService';

interface ChatSession {
  id: string;
  mode: ChatMode;
  messages: Message[];
  context: any; // Store extracted context from conversation
  createdAt: Date;
  updatedAt: Date;
}

interface ChatState {
  // Current session
  currentSessionId: string | null;
  currentMode: ChatMode | null;
  messages: Message[];
  context: any;
  
  // Session management
  sessions: Record<string, ChatSession>;
  
  // Actions
  setMode: (mode: ChatMode) => void;
  addMessage: (message: Message) => void;
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  setContext: (context: any) => void;
  updateContext: (updates: any) => void;
  
  // Session actions
  createSession: (mode: ChatMode) => string;
  loadSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  saveCurrentSession: () => void;
  
  // Utility
  getSessionsByMode: (mode: ChatMode) => ChatSession[];
  getRecentSessions: (limit?: number) => ChatSession[];
}

const sanitizeMessages = (messages: Message[]): Message[] =>
  messages.map(({ attachments, ...rest }) => rest);

const sanitizeContext = (context: any) => {
  if (!context) return {};
  const { attachments, ...rest } = context;
  return rest;
};

const sanitizeSession = (session: ChatSession): ChatSession => ({
  ...session,
  messages: sanitizeMessages(session.messages),
  context: sanitizeContext(session.context),
});

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentSessionId: null,
      currentMode: null,
      messages: [],
      context: {},
      sessions: {},
      
      // Mode and message management
      setMode: (mode) => {
        // FIX: Avoid race condition by capturing state once and doing atomic update
        set((state) => {
          // Save current session inline if switching modes with messages
          let updatedSessions = { ...state.sessions };

          if (state.currentMode && state.currentMode !== mode && state.messages.length > 0 && state.currentSessionId) {
            // Inline save of current session
            const savedSession: ChatSession = {
              id: state.currentSessionId,
              mode: state.currentMode,
              messages: sanitizeMessages(state.messages),
              context: sanitizeContext(state.context),
              createdAt: state.sessions[state.currentSessionId]?.createdAt || new Date(),
              updatedAt: new Date()
            };
            updatedSessions[state.currentSessionId] = savedSession;
          }

          // Create new session inline
          const newSessionId = `${mode}-${Date.now()}`;
          const newSession: ChatSession = {
            id: newSessionId,
            mode,
            messages: [],
            context: {},
            createdAt: new Date(),
            updatedAt: new Date()
          };
          updatedSessions[newSessionId] = newSession;

          return {
            sessions: updatedSessions,
            currentMode: mode,
            currentSessionId: newSessionId,
            messages: [],
            context: {}
          };
        });
      },
      
      addMessage: (message) => set((state) => ({
        messages: [...state.messages, message]
      })),
      
      updateMessage: (messageId, updates) => set((state) => ({
        messages: state.messages.map(msg =>
          msg.id === messageId ? { ...msg, ...updates } : msg
        )
      })),
      
      clearMessages: () => set({
        messages: [],
        context: {}
      }),
      
      setContext: (context) => set({ context }),
      
      updateContext: (updates) => set((state) => ({
        context: { ...state.context, ...updates }
      })),
      
      // Session management
      createSession: (mode) => {
        const sessionId = `${mode}-${Date.now()}`;
        const session: ChatSession = {
          id: sessionId,
          mode,
          messages: [],
          context: {},
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: session
          }
        }));
        
        return sessionId;
      },
      
      loadSession: (sessionId) => {
        const state = get();
        const session = state.sessions[sessionId];
        
        if (session) {
          set({
            currentSessionId: sessionId,
            currentMode: session.mode,
            messages: session.messages,
            context: session.context
          });
        }
      },
      
      deleteSession: (sessionId) => set((state) => {
        const { [sessionId]: deleted, ...rest } = state.sessions;
        return {
          sessions: rest,
          currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId
        };
      }),
      
      saveCurrentSession: () => {
        const state = get();
        
        if (state.currentSessionId && state.currentMode) {
          const session: ChatSession = {
            id: state.currentSessionId,
            mode: state.currentMode,
            messages: sanitizeMessages(state.messages),
            context: sanitizeContext(state.context),
            createdAt: state.sessions[state.currentSessionId]?.createdAt || new Date(),
            updatedAt: new Date()
          };
          
          set((state) => ({
            sessions: {
              ...state.sessions,
              [state.currentSessionId!]: session
            }
          }));
        }
      },
      
      // Utility functions
      getSessionsByMode: (mode) => {
        const state = get();
        return Object.values(state.sessions)
          .filter(session => session.mode === mode)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      },
      
      getRecentSessions: (limit = 10) => {
        const state = get();
        return Object.values(state.sessions)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, limit);
      }
    }),
    {
      name: 'maifarm-chat',
      partialize: (state) => ({
        sessions: Object.fromEntries(
          Object.entries(state.sessions).map(([id, session]) => [id, sanitizeSession(session)])
        )
      })
    }
  )
);

// Helper hook for accessing chat context
export const useChatContext = () => {
  const context = useChatStore((state) => state.context);
const storeUpdateContext = useChatStore((state) => state.updateContext);

  const applyUpdates = (updates: Record<string, any>) => {
    storeUpdateContext(updates);
    aiChatService.updateContext(updates);
  };
  
  return {
    context,
    updateContext: applyUpdates,
    
    // Convenience methods for common context updates
    setTaskDescription: (description: string) => applyUpdates({ taskDescription: description }),
    setNumberOfAgents: (count: number) => applyUpdates({ numberOfAgents: count }),
    setCreativityLevel: (level: number) => applyUpdates({ creativityLevel: level }),
    setTimeoutMinutes: (minutes: number) => applyUpdates({ timeoutMinutes: minutes }),
    setAttachments: (files: File[]) => applyUpdates({ attachments: files }),
    addFocusArea: (area: string) => applyUpdates({ 
      focusAreas: [...(context.focusAreas || []), area] 
    }),
    setYamlConfig: (yaml: string) => applyUpdates({ yamlConfig: yaml }),
    setFinalPrompt: (prompt: string) => applyUpdates({ finalPrompt: prompt })
  };
};
