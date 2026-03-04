import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  BUILT_IN_TEMPLATES,
  deleteCustomTemplate,
  getCustomTemplates,
  saveCustomTemplate,
  type SummaryTemplate,
  type TemplateId,
} from '../lib/templates';

export function useTemplates() {
  const [customTemplates, setCustomTemplates] = useState<SummaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadTemplates = async () => {
      try {
        const storedTemplates = await getCustomTemplates();
        if (!active) {
          return;
        }
        setCustomTemplates(storedTemplates);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadTemplates();

    return () => {
      active = false;
    };
  }, []);

  const allTemplates = useMemo(
    () => [...BUILT_IN_TEMPLATES, ...customTemplates],
    [customTemplates],
  );

  const createTemplate = useCallback(
    async (name: string, description: string, prompt: string) => {
      const template: SummaryTemplate = {
        id: crypto.randomUUID(),
        name,
        description,
        prompt,
        isBuiltIn: false,
      };

      await saveCustomTemplate(template);
      setCustomTemplates((previous) => [...previous, template]);
      return template;
    },
    [],
  );

  const updateTemplate = useCallback(async (template: SummaryTemplate) => {
    const customTemplate = {
      ...template,
      isBuiltIn: false,
    };
    await saveCustomTemplate(customTemplate);
    setCustomTemplates((previous) =>
      previous.map((entry) => (entry.id === customTemplate.id ? customTemplate : entry)),
    );
  }, []);

  const removeTemplate = useCallback(async (id: TemplateId) => {
    await deleteCustomTemplate(id);
    setCustomTemplates((previous) => previous.filter((template) => template.id !== id));
  }, []);

  return {
    allTemplates,
    customTemplates,
    builtInTemplates: BUILT_IN_TEMPLATES,
    loading,
    createTemplate,
    updateTemplate,
    removeTemplate,
  };
}
