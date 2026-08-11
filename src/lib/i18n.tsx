"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { vi } from "@/i18n/vi";
import { ja, jaUi } from "@/i18n/ja";

type Lang = "vi" | "ja";
type Translations = typeof vi;

const structuredTranslations: Record<string, string> = {};
for (const section of ["common", "status", "priority", "task", "employee", "login"] as const) {
  for (const key of Object.keys(vi[section]) as Array<keyof typeof vi[typeof section]>) {
    structuredTranslations[vi[section][key]] = ja[section][key];
  }
}
const uiTranslations = { ...structuredTranslations, ...jaUi };
const translationEntries = Object.entries(uiTranslations).sort(([a], [b]) => b.length - a.length);
const restorationEntries = Object.entries(uiTranslations)
  .map(([source, target]) => [target, source] as const)
  .sort(([a], [b]) => b.length - a.length);
const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

function translateLegacyValue(value: string): string {
  let translated = value;
  for (const [source, target] of translationEntries) {
    translated = translated.replaceAll(source, target);
  }
  return translated;
}

function restoreLegacyValue(value: string): string {
  let restored = value;
  for (const [target, source] of restorationEntries) {
    restored = restored.replaceAll(target, source);
  }
  return restored;
}

function translateLegacyDom(lang: Lang, root: ParentNode = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const parentTag = textNode.parentElement?.tagName;
    const ignored = textNode.parentElement?.closest("[data-i18n-ignore]");
    if (parentTag !== "SCRIPT" && parentTag !== "STYLE" && !ignored) {
      const saved = originalText.get(textNode);
      if (lang === "ja") {
        const source = saved && textNode.data === translateLegacyValue(saved) ? saved : textNode.data;
        originalText.set(textNode, source);
        const translated = translateLegacyValue(source);
        if (translated !== textNode.data) textNode.data = translated;
      } else {
        const source = saved && textNode.data === translateLegacyValue(saved)
          ? saved
          : restoreLegacyValue(textNode.data);
        originalText.set(textNode, source);
        if (textNode.data !== source) textNode.data = source;
      }
    }
    current = walker.nextNode();
  }

  const elements = root instanceof Element ? [root, ...root.querySelectorAll("*")] : [...root.querySelectorAll("*")];
  for (const element of elements) {
    if (element.closest("[data-i18n-ignore]")) continue;
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      const currentValue = element.getAttribute(attribute);
      if (currentValue === null) continue;
      let savedAttributes = originalAttributes.get(element);
      if (!savedAttributes) {
        savedAttributes = new Map();
        originalAttributes.set(element, savedAttributes);
      }
      const saved = savedAttributes.get(attribute);
      if (lang === "ja") {
        const source = saved && currentValue === translateLegacyValue(saved) ? saved : currentValue;
        savedAttributes.set(attribute, source);
        element.setAttribute(attribute, translateLegacyValue(source));
      } else {
        const source = saved && currentValue === translateLegacyValue(saved)
          ? saved
          : restoreLegacyValue(currentValue);
        savedAttributes.set(attribute, source);
        if (currentValue !== source) element.setAttribute(attribute, source);
      }
    }
  }
}

const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
  tr: (text: string) => string;
}>({
  lang: "vi",
  setLang: () => {},
  t: vi,
  tr: (text) => text,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore<Lang>(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("language-change", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("language-change", onStoreChange);
      };
    },
    () => localStorage.getItem("lang") === "ja" ? "ja" as const : "vi" as const,
    () => "vi" as const,
  );

  const setLang = (l: Lang) => {
    localStorage.setItem("lang", l);
    window.dispatchEvent(new Event("language-change"));
  };

  const t = lang === "ja" ? ja : vi;
  const tr = (text: string) => lang === "ja" ? (uiTranslations[text] ?? text) : text;

  useEffect(() => {
    document.documentElement.lang = lang;
    translateLegacyDom(lang);
    const nativeAlert = window.alert.bind(window);
    const nativeConfirm = window.confirm.bind(window);
    if (lang === "ja") {
      window.alert = (message) => nativeAlert(translateLegacyValue(String(message)));
      window.confirm = (message) => nativeConfirm(translateLegacyValue(String(message)));
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target.parentNode) {
          translateLegacyDom(lang, mutation.target.parentNode);
        }
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) translateLegacyDom(lang, node);
          else if (node.nodeType === Node.TEXT_NODE && node.parentNode) translateLegacyDom(lang, node.parentNode);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      window.alert = nativeAlert;
      window.confirm = nativeConfirm;
    };
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t, tr }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
