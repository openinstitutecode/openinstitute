import { ReactNode, useCallback, useRef, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

// Batch 73 — KUX-015: promise-based replacement for window.confirm. `const [confirm, dialog] = useConfirm();`
// then `if (!(await confirm({ title, body, danger: true }))) return;` and render `{dialog}` once anywhere in the JSX.
export type ConfirmOptions = { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean };
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => { resolver.current?.(false); resolver.current = resolve; setOpts(o); }), []);
  const close = (v: boolean) => { resolver.current?.(v); resolver.current = null; setOpts(null); };
  const dialog = (
    <ConfirmDialog open={!!opts} title={opts?.title ?? ""} confirmLabel={opts?.confirmLabel} danger={opts?.danger} onConfirm={() => close(true)} onCancel={() => close(false)}>
      {opts?.body}
    </ConfirmDialog>
  );
  return [confirm, dialog];
}
