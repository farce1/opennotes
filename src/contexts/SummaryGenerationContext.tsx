import { createContext, useContext, useState, type ReactNode } from 'react';

interface SummaryGenerationContextValue {
  generating: boolean;
  setGenerating: (value: boolean) => void;
}

const SummaryGenerationContext = createContext<SummaryGenerationContextValue>({
  generating: false,
  setGenerating: () => {},
});

export function SummaryGenerationProvider({ children }: { children: ReactNode }) {
  const [generating, setGenerating] = useState(false);

  return (
    <SummaryGenerationContext.Provider value={{ generating, setGenerating }}>
      {children}
    </SummaryGenerationContext.Provider>
  );
}

export function useSummaryGeneration() {
  return useContext(SummaryGenerationContext);
}
