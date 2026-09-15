"use client";

export type AiClientPageState = Record<string, string | boolean | null>;

let currentContext: { pathname: string; pageState: AiClientPageState } | null = null;

export function setAiPageContext(pathname: string, pageState: AiClientPageState) {
  currentContext = { pathname, pageState };
}

export function clearAiPageContext(pathname: string) {
  if (currentContext?.pathname === pathname) currentContext = null;
}

export function getAiPageContext(pathname: string): AiClientPageState | undefined {
  return currentContext?.pathname === pathname ? currentContext.pageState : undefined;
}
