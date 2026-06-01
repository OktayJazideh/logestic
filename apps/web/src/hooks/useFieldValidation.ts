import { useCallback, useState } from "react";
import type { FieldSchema, FieldValidator } from "../lib/validation";
import { runValidators, schemaHasErrors, validateSchema } from "../lib/validation";

export function useFieldValidation() {
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const setFieldError = useCallback((name: string, message: string | undefined) => {
    setErrors((prev) => ({ ...prev, [name]: message }));
  }, []);

  const validateField = useCallback((name: string, value: string, validators: FieldValidator[]) => {
    const message = runValidators(value, validators);
    setErrors((prev) => ({ ...prev, [name]: message }));
    return !message;
  }, []);

  const validateAll = useCallback((schema: FieldSchema) => {
    const next = validateSchema(schema);
    setErrors((prev) => ({ ...prev, ...next }));
    return !schemaHasErrors(next);
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);

  const mergeErrors = useCallback((next: Record<string, string | undefined>) => {
    setErrors((prev) => ({ ...prev, ...next }));
  }, []);

  const getError = useCallback((name: string) => errors[name], [errors]);

  return { errors, getError, setFieldError, validateField, validateAll, clearErrors, mergeErrors, setErrors };
}
