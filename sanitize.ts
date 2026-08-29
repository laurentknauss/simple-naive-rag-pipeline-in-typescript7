/**
 * sanitize.ts — protection anti prompt injection pour données externes.
 *
 * Portage TypeScript de `sanitize.py` (email_processor) : assainit tout
 * contenu non fiable (emails, PDFs, docs tiers) AVANT indexation/envoi au LLM.
 *
 * Rôle : le contexte RAG est un vecteur d'attaque — un document peut contenir
 * « ignore previous instructions and … ». On neutralise les balises et tokens
 * spéciaux (qui donnent leur autorité aux injections) et on alerte.
 * Usage :
 *   import { sanitizeEmail, sanitizePdf } from "./sanitize.js";
 *   const propre = sanitizePdf(texteExtrait, "fresnillo.pdf");
 */
/** Longueur maximale d'un texte source (limite coût + surface d'attaque). */
export const MAX_TEXT_LENGTH = 50_000;
/** Marqueur ajouté en fin de texte tronqué. */
export const TRUNCATION_MARKER = "\n[... tronqué]";

/** Balises/tokens neutralisés en cas de détection d'injection. */
const TAG_RE = /<[^>]{0,200}>/g;
export const SPECIAL_TOKEN_RE = /\[INST\]|<<SYS>>|<\|.*?\|>/g;

/**
 * Patterns d'injection connus (insensibles à la casse).
 * Deux familles :
 *  - phrases d'usurpation d'autorité (« ignore previous instructions », …)
 *  - tokens spéciaux de modèles (GPT `<|…|>`, Llama `[INST]`/`<<SYS>>`, …)
 */
export const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /disregard\s+(your|all|the)/i,
  /forget\s+(everything|what|all)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions\s*:/i,
  /system\s*prompt/i,
  /act\s+as\s+(if\s+you\s+are|a\s+)/i,
  /jailbreak/i,
  /<\|.*?\|>/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /###\s*instruction/i,
];

/**
 * Nettoie du texte externe avant envoi à un LLM.
 *
 * - Tronque les textes excessivement longs (> MAX_TEXT_LENGTH)
 * - Détecte les patterns d'injection → log + neutralise balises/tokens
 * - Retourne toujours une string utilisable (jamais null/undefined)
 */
export function sanitize(text: string | null | undefined, source = "unknown"): string {
  if (!text) return "";

  let cleaned = text;

  // Troncature préventive : borne la taille et la surface d'attaque.
  if (cleaned.length > MAX_TEXT_LENGTH) {
    cleaned = cleaned.slice(0, MAX_TEXT_LENGTH) + TRUNCATION_MARKER;
  }

  // Détection d'injection.
  const injectionDetected = INJECTION_PATTERNS.some((pattern) => pattern.test(cleaned));

  if (injectionDetected) {
    console.warn(
      `⚠️  [sanitize] Prompt injection détectée dans '${source}' — balises nettoyées.`,
    );
    // Neutraliser les balises XML/HTML et tokens spéciaux.
    cleaned = cleaned.replace(TAG_RE, "[TAG]");
    cleaned = cleaned.replace(SPECIAL_TOKEN_RE, "[TOKEN]");
  }

  return cleaned.trim();
}

/** Wrapper pour les corps d'emails (source = `email:<expéditeur>`). */
export function sanitizeEmail(body: string | null | undefined, sender = ""): string {
  return sanitize(body, `email:${sender}`);
}

/** Wrapper pour le contenu extrait de PDFs (source = `pdf:<nom>`). */
export function sanitizePdf(text: string | null | undefined, filename = ""): string {
  return sanitize(text, `pdf:${filename}`);
}