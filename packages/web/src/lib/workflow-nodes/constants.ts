// ---- Condition operators ----

export const CONDITION_OPERATORS = [
  { value: 'equals', label: 'operators.equals' },
  { value: 'not_equals', label: 'operators.not_equals' },
  { value: 'greater_than', label: 'operators.greater_than' },
  { value: 'less_than', label: 'operators.less_than' },
  { value: 'greater_than_or_equal', label: 'operators.greater_than_or_equal' },
  { value: 'less_than_or_equal', label: 'operators.less_than_or_equal' },
  { value: 'contains', label: 'operators.contains' },
  { value: 'not_contains', label: 'operators.not_contains' },
  { value: 'starts_with', label: 'operators.starts_with' },
  { value: 'ends_with', label: 'operators.ends_with' },
  { value: 'is_empty', label: 'operators.is_empty' },
  { value: 'is_not_empty', label: 'operators.is_not_empty' },
  { value: 'is_true', label: 'operators.is_true' },
  { value: 'is_false', label: 'operators.is_false' },
] as const;

export const NO_VALUE_OPERATORS = new Set(['is_empty', 'is_not_empty', 'is_true', 'is_false']);

// ---- Default code template ----

export const RUN_CODE_DEFAULT_CODE = `async function main({ params }) {
  const ret = {
    "key0": params.input + params.input,
    "key1": ["hello", "world"],
    "key2": {
      "key21": "hi",
    },
  }

  return ret
}`;

export const RUN_PYTHON_DEFAULT_CODE = `def main(params):
    ret = {
        "key0": params.get("input", "") + params.get("input", ""),
        "key1": ["hello", "world"],
        "key2": {
            "key21": "hi",
        },
    }

    return ret
`;
