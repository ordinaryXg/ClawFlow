import { createContext, useContext, type FC, type ReactNode } from 'react';

export type ShellLayoutVariant = 'standard' | 'alternate';

type ShellLayoutCtx = { variant: ShellLayoutVariant };

const ShellLayoutContext = createContext<ShellLayoutCtx>({ variant: 'standard' });

export const ShellLayoutProvider: FC<{ variant: ShellLayoutVariant; children: ReactNode }> = ({
  variant,
  children,
}) => <ShellLayoutContext.Provider value={{ variant }}>{children}</ShellLayoutContext.Provider>;

export function useShellLayoutVariant(): ShellLayoutVariant {
  return useContext(ShellLayoutContext).variant;
}
