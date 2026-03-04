import { createContext, type ReactNode, useContext } from 'react';

import { useSession } from '../hooks/useSession';

type SessionContextValue = ReturnType<typeof useSession>;

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSessionContext(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }

  return context;
}
