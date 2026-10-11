import { countTokens as count } from 'gpt-tokenizer/encoding/cl100k_base';

/**
 * Approximate token count. Claude's tokenizer is not public, so a GPT tokenizer is used as a
 * stable yardstick: good enough to compare "before" and "after". Kept in its own entry point so
 * the browser only downloads the vocabulary on the Health screen.
 */
export function countTokens(text: string): number {
  return text.length === 0 ? 0 : count(text);
}
