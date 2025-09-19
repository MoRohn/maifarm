import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Message } from '@/components/Chat/ChatMessage';
import { ChatMode } from '@/components/Chat/GlassmorphicChatModal';

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
        const state = get();
        
        // Save current session if switching modes
        if (state.currentMode && state.currentMode !== mode && state.messages.length > 0) {
          state.saveCurrentSession();
        }
        
        // Create new session for this mode
        const sessionId = state.createSession(mode);
        
        set({
          currentMode: mode,
          currentSessionId: sessionId,
          messages: [],
          context: {}
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
            messages: state.messages,
            context: state.context,
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
        sessions: state.sessions
      })
    }
  )
);

// Helper hook for accessing chat context
export const useChatContext = () => {
  const context = useChatStore((state) => state.context);
  const updateContext = useChatStore((state) => state.updateContext);
  
  return {
    context,
    updateContext,
    
    // Convenience methods for common context updates
    setTaskDescription: (description: string) => updateContext({ taskDescription: description }),
    setNumberOfAgents: (count: number) => updateContext({ numberOfAgents: count }),
    setCreativityLevel: (level: number) => updateContext({ creativityLevel: level }),
    setTimeoutMinutes: (minutes: number) => updateContext({ timeoutMinutes: minutes }),
    setAttachments: (files: File[]) => updateContext({ attachments: files }),
    addFocusArea: (area: string) => updateContext({ 
      focusAreas: [...(context.focusAreas || []), area] 
    }),
    setYamlConfig: (yaml: string) => updateContext({ yamlConfig: yaml }),
    setFinalPrompt: (prompt: string) => updateContext({ finalPrompt: prompt })
  };
};