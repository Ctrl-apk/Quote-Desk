import { useId, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  label: string;
  error?: string;
}

/** Label, input and error message wired together for screen readers and keyboard users. */
export function TextField({ label, error, ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...props} />
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
