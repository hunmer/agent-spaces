import { useCallback, useMemo } from 'react';
import { PromptTextEditor } from '@agent-spaces/ui';
import { extractTemplateVariables } from '../../utils/connection-targets.js';

export default function TextVariableEditor({
  data,
  field,
  value = '',
  resolvedValue,
  onChange,
  references = [],
  placeholder,
  valueFormat = 'text',
  singleLine = false,
  className,
}) {
  const templateVariables = useMemo(() => extractTemplateVariables(value), [value]);
  const editorValue = templateVariables.length ? value : (resolvedValue ?? value);
  const manualValues = data?.textVariableValues?.[field] || {};
  const fieldBindings = data?.textVariableBindings?.[field] || {};
  const variables = useMemo(() => [...templateVariables.map((key) => {
    const connections = Array.isArray(fieldBindings[key]) ? fieldBindings[key] : [];
    const connectedValue = Array.from(new Set(connections.map((item) => item.value).filter(Boolean))).join('\n\n');
    const manualValue = manualValues[key] || '';
    return {
      key,
      value: manualValue,
      displayValue: connectedValue || manualValue,
      connections,
    };
  }), ...(data?.textOutputSuggestions || []).map((item) => ({
    key: `${item.nodeLabel}.${item.key}`,
    isOutput: true,
    value: item.value || '',
    displayValue: item.value || '',
    connections: [],
  }))], [data?.textOutputSuggestions, fieldBindings, manualValues, templateVariables]);

  const handleVariableValueChange = useCallback((key, nextValue) => {
    const nextField = { ...manualValues };
    if (nextValue) nextField[key] = nextValue;
    else delete nextField[key];
    const nextValues = { ...(data?.textVariableValues || {}) };
    if (Object.keys(nextField).length) nextValues[field] = nextField;
    else delete nextValues[field];
    data?.onUpdate?.({
      textVariableValues: Object.keys(nextValues).length ? nextValues : undefined,
    });
  }, [data, field, manualValues]);

  return <PromptTextEditor
    value={editorValue}
    onChange={onChange}
    references={references}
    placeholder={placeholder}
    className={className}
    variables={variables}
    outputSuggestions={data?.textOutputSuggestions || []}
    valueFormat={valueFormat}
    singleLine={singleLine}
    onVariableValueChange={handleVariableValueChange}
    onVariableDisconnect={data?.onDeleteEdge}
  />;
}
