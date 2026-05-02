'use client'

import { useEffect, useState } from "react";
import { Inspector, gotoServerEditor } from "react-dev-inspector";

type ReactFiber = {
  return?: ReactFiber | null;
  _debugSource?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  _debugOwner?: ReactFiber | null;
};

type FiberElement = HTMLElement & {
  [key: string]: ReactFiber | undefined;
};

function getFiber(element: HTMLElement | null): ReactFiber | undefined {
  if (!element) return undefined;

  const fiberKey = Object.keys(element).find(
    (key) =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$")
  );

  if (fiberKey) return (element as FiberElement)[fiberKey];
  return getFiber(element.parentElement);
}

function getCodeInfo(element: HTMLElement) {
  const sourceElement = element.closest<HTMLElement>(
    "[data-inspector-relative-path]"
  );

  if (sourceElement?.dataset.inspectorRelativePath) {
    return {
      relativePath: sourceElement.dataset.inspectorRelativePath,
      lineNumber: sourceElement.dataset.inspectorLine ?? "1",
      columnNumber: sourceElement.dataset.inspectorColumn ?? "1",
    };
  }

  let fiber = getFiber(element);

  while (fiber) {
    const source = fiber._debugSource ?? fiber._debugOwner?._debugSource;

    if (source?.fileName && source.lineNumber) {
      return {
        absolutePath: source.fileName,
        lineNumber: String(source.lineNumber),
        columnNumber: String(source.columnNumber ?? 1),
      };
    }

    fiber = fiber.return ?? undefined;
  }

  return undefined;
}

export function DevInspector() {
  const [active, setActive] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!active) return;

    const handleClick = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const codeInfo = getCodeInfo(target);
      console.debug("[react-dev-inspector] native click", codeInfo);
      setActive(false);

      if (codeInfo) {
        gotoServerEditor(codeInfo);
      }
      else {
        console.warn("[react-dev-inspector] no React source info found", target);
      }
    };

    window.addEventListener("click", handleClick, true);
    return () => window.removeEventListener("click", handleClick, true);
  }, [active]);

  if (process.env.NODE_ENV !== "development") return null;
  if (!mounted) return null;

  return (
    <>
      <Inspector
        active={active}
        onActiveChange={(nextActive) => {
          console.debug("[react-dev-inspector] active", nextActive);
          setActive(nextActive);
        }}
        onClickElement={({ codeInfo, fiber, name }) => {
          console.debug("[react-dev-inspector] click", {
            codeInfo,
            hasFiber: Boolean(fiber),
            name,
          });
        }}
        onInspectElement={({ codeInfo }) => {
          console.debug("[react-dev-inspector] inspect", codeInfo);
          gotoServerEditor(codeInfo);
        }}
      />
      <button
        type="button"
        onClick={() => setActive((value) => !value)}
        aria-pressed={active}
        title="Inspect React component source"
        className="fixed bottom-3 right-3 z-[2147483647] h-8 rounded border border-border bg-background px-2 text-xs font-medium shadow hover:bg-muted"
      >
        {active ? "Inspecting" : "Inspect"}
      </button>
    </>
  );
}
