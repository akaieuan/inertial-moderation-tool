import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type DemoMode = boolean;

type DemoContextValue = {
  demo: DemoMode;
  setDemo: (next: DemoMode) => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

const STORAGE_KEY = "inertial-demo";
const EVENT_NAME = "inertial:demo-mode-change";

function readStored(defaultValue: DemoMode): DemoMode {
  if (typeof window === "undefined") return defaultValue;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "on") return true;
  if (raw === "off") return false;
  return defaultValue;
}

/**
 * Imperative read used by `lib/api.ts` so every fetch wrapper can branch on
 * demo mode without taking a hook dependency. Stays in sync with React state
 * via the storage event below.
 */
export function isDemoModeActive(): boolean {
  return readStored(true);
}

export function DemoModeProvider({
  children,
  defaultValue = true,
}: {
  children: React.ReactNode;
  defaultValue?: DemoMode;
}) {
  const [demo, setDemoState] = useState<DemoMode>(() => readStored(defaultValue));

  useEffect(() => {
    const onChange = () => setDemoState(readStored(defaultValue));
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [defaultValue]);

  const setDemo = useCallback((next: DemoMode) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // ignore
    }
    setDemoState(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  const value = useMemo<DemoContextValue>(() => ({ demo, setDemo }), [demo, setDemo]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoMode(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemoMode must be used inside <DemoModeProvider>");
  return ctx;
}
