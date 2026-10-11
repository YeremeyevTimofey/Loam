import { BUDGET_WORDS, MAX_SKILL_BYTES, PLACEHOLDER } from './constants';
import { countWords, normalizeText } from './frontmatter';
import type { SkillSource } from './schema';

/**
 * Static scanner for skill text. One implementation for the browser and the MCP server.
 *
 * Red flags block the import with no way around it ("add anyway" does not exist).
 * Yellow flags allow the import but mark the skill `scanner: warn`.
 *
 * A scanner like this is a first filter, not a proof: patterns can be dodged by a determined author.
 * That is why imported skills are also treated as untrusted data by the agent (AGENTS.md), cannot
 * write to the base (capabilities), and can be reviewed by the user's own agent (§14.5).
 */

export type RedCategory =
  | 'delete'
  | 'network'
  | 'exfiltration'
  | 'injection'
  | 'escape'
  | 'credentials'
  | 'capability'
  | 'size';
export type YellowCategory =
  | 'length'
  | 'description'
  | 'license'
  | 'capabilities'
  | 'unknown-system'
  | 'hidden'
  | 'tools'
  | 'scope';

export interface Finding {
  level: 'red' | 'yellow';
  category: RedCategory | YellowCategory;
  /** 1-based line in the scanned text; 0 when the finding is about the file as a whole. */
  line: number;
  /** The line that triggered the rule, trimmed. */
  text: string;
  /** Plain-language explanation for the user. */
  message: string;
}

export interface ScanResult {
  verdict: 'pass' | 'warn' | 'fail';
  red: Finding[];
  yellow: Finding[];
}

export interface ScanInput {
  /** Full file text, front matter included. */
  text: string;
  /** Body only, used for the length check. */
  body: string;
  description: string;
  license?: string;
  capabilities: string[];
  source: SkillSource;
  /** Keys found in the front matter, to spot things like `allowed-tools`. */
  frontmatterKeys?: string[];
  /** Text of profile.md, to find systems the skill mentions that the user does not use. */
  profileText?: string;
}

export const RED_MESSAGE: Record<RedCategory, string> = {
  delete: "This skill asks your AI to delete, overwrite or clear files. We didn't add it.",
  network:
    "This skill points to the internet: a link, a download, or sending something somewhere. Loam skills can't use the network, so we didn't add it.",
  exfiltration: "This skill tries to read your files and send them somewhere. We didn't add it.",
  injection: "This skill tries to change how your AI behaves. We didn't add it.",
  escape: "This skill reaches for files outside your knowledge base folder. We didn't add it.",
  credentials: "This skill asks for passwords, keys or tokens. We didn't add it.",
  capability: "This skill claims, or needs, more permissions than an imported skill can have. We didn't add it.",
  size: "This file is too large to be a skill. We didn't add it.",
};

export const YELLOW_MESSAGE: Record<YellowCategory, string> = {
  length: `This skill is longer than ${BUDGET_WORDS.skill} words. Long skills cost more context and are harder to trust.`,
  description: "The description is empty or looks like a template. Your AI uses it to decide when to apply the skill.",
  license: "The skill doesn't say what licence it is under.",
  capabilities: 'The skill asks for more than reading.',
  'unknown-system': "The skill mentions a tool that isn't in your profile.",
  hidden: 'The skill contains hidden or encoded text that is hard to review.',
  tools: 'The skill declares tool permissions. Loam ignores them, but you should know.',
  scope: 'The skill asks your AI to read broadly instead of only what it needs.',
};

// ---------------------------------------------------------------- text helpers

const LOOKALIKES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ѕ: 's', ј: 'j', к: 'k', м: 'm', н: 'h',
  т: 't', в: 'b', ԁ: 'd', ɡ: 'g', ο: 'o', α: 'a', ε: 'e', ι: 'i', κ: 'k', ν: 'v', ρ: 'p', τ: 't', υ: 'u', χ: 'x',
};
// Zero-width, bidi controls, word joiners, soft hyphen, Unicode "tag" characters.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\u00AD\uFEFF]|[\u{E0000}-\u{E007F}]/u;
const INVISIBLE_G = new RegExp(INVISIBLE.source, 'gu');

/** Lowercase-latin look-alike version of a line, so "ignоre" (Cyrillic о) is still caught. */
function skeleton(line: string): string {
  return line
    .normalize('NFKC')
    .replace(INVISIBLE_G, '')
    .split('')
    .map((ch) => LOOKALIKES[ch] ?? LOOKALIKES[ch.toLowerCase()] ?? ch)
    .join('');
}

/** True when the match is directly preceded by a negation ("never delete", "do not send"). */
function negated(text: string, index: number, strict = false): boolean {
  const before = text.slice(Math.max(0, index - 24), index).toLowerCase();
  if (strict) return /\b(?:do not|don't|must not|should not|shall not|never)\s+(?:ever\s+)?$/.test(before);
  return /(?:\bnot|n't|\bnever|\bno|\bwithout|\bavoid)\s+(?:\w+\s+)?$/.test(before);
}

// ---------------------------------------------------------------- rules

interface Rule {
  category: RedCategory;
  re: RegExp;
  /**
   * Skip when the phrase is negated ("never delete files"). `strict` only accepts an explicit
   * "do not / never / must not" directly before the verb, so "not only ignore ..." still counts.
   * Never used for URLs, hidden characters or role resets.
   */
  allowNegation: boolean | 'strict';
  /** Also run on the original (non-skeleton) text; used for non-Latin patterns. */
  originalOnly?: boolean;
}

// Objects of a destructive verb. "Soft" verbs (remove, clear, move ...) are common in everyday writing,
// so they only count when the object is clearly a file or folder.
const SOFT_OBJECTS =
  'files?|folders?|directories|directory|knowledge base|the base|your base|my base|workspace|disk|backups?|\\.md\\b|SKILL\\.md|AGENTS\\.md|CLAUDE\\.md|process\\.md|\\.claude|\\.loam';
const HARD_OBJECTS = `${SOFT_OBJECTS}|history|everything|examples?|corrections|notes|profile|all data|all (?:of )?(?:the )?(?:content|data)`;

const TLD =
  'com|net|org|io|dev|app|ai|co|ru|ly|xyz|info|biz|cloud|online|site|link|top|me|us|uk|de|fr|nl|eu|ca|au|jp|cn|tk|ml';

// Text that looks like an actual secret, not a request for one. Shared with the "copy for a chat" check.
const SECRET_KEY_SHAPES =
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b|\bghp_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}|\bAKIA[0-9A-Z]{16}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./;
const SECRET_ASSIGNMENT = /\b(?:api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["']?[A-Za-z0-9+/_-]{12,}/i;

/** Lines that contain what looks like a key, token or password. Used to warn before text leaves the computer. */
export function findSecretLike(text: string): number[] {
  const lines: number[] = [];
  text.split('\n').forEach((line, i) => {
    if (SECRET_KEY_SHAPES.test(line) || SECRET_ASSIGNMENT.test(line)) lines.push(i + 1);
  });
  return lines;
}

const RULES: Rule[] = [
  // ---- injection: no negation exceptions, a skill has no business discussing this
  { category: 'injection', allowNegation: 'strict', re: /\b(?:ignore|disregard|forget|override|bypass|discard|skip)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|preceding|all|any|your|the|these|those|system|safety)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|guidelines?|directions?|constraints?|restrictions?|programming|messages?|context|AGENTS\.md)\b/i },
  { category: 'injection', allowNegation: false, re: /\byou are now\b(?!\s+(?:ready|done|finished|set|able|at|in|on|going|looking|reading|working|writing|preparing|about))/i },
  { category: 'injection', allowNegation: false, re: /\byou(?:'re| are)\s+(?:no longer|not)\s+(?:bound|restricted|limited|an?\s+ai)\b/i },
  { category: 'injection', allowNegation: false, re: /\bnew (?:system )?(?:instructions?|role|persona|rules)\b/i },
  { category: 'injection', allowNegation: false, re: /\bsystem prompt\b/i },
  { category: 'injection', allowNegation: false, re: /\b(?:developer|god|admin|dan|jailbreak(?:ed)?|unrestricted|sudo) mode\b|\bjailbreak/i },
  { category: 'injection', allowNegation: false, re: /\b(?:pretend|act|behave|respond)\s+(?:to be|as if|as though)\s+(?:you\s+(?:are|were)\s+)?(?:not|an?\s+(?:unrestricted|unfiltered|different))/i },
  { category: 'injection', allowNegation: false, re: /\bfrom now on\b[^.\n]{0,40}\byou\b/i },
  { category: 'injection', allowNegation: false, re: /\b(?:do not|don'?t|never|stop)\s+(?:follow|obey|listen to|following)\s+(?:the\s+)?(?:previous|above|system|safety|original|agents|your)/i },
  { category: 'injection', allowNegation: false, re: /\b(?:reveal|print|show|repeat|output|leak)\b[^.\n]{0,30}\b(?:system prompt|your instructions|hidden (?:prompt|instructions)|initial prompt)/i },
  { category: 'injection', allowNegation: false, re: /<\/?\s*(?:system|assistant|user|instructions?)\s*>/i },
  { category: 'injection', allowNegation: false, re: /\[\/?INST\]|<\|im_(?:start|end)\|>|<\|(?:system|endoftext)\|>/i },
  { category: 'injection', allowNegation: false, re: /^\s*(?:#{1,3}\s*)?(?:system|assistant)\s*:/i },
  { category: 'injection', allowNegation: false, re: /\bAGENTS\.md\b[^.\n]{0,40}\b(?:ignore|override|disable|does not apply|no longer|outdated)/i },
  { category: 'injection', allowNegation: false, re: /\boverrides?\s+(?:the |your |all )?(?:rules|instructions|agents\.md|safety|guidelines|restrictions)\b/i },
  { category: 'injection', allowNegation: false, re: /={3,}\s*(?:BEGIN|END)\s+(?:UNTRUSTED|IMPORTED)\s+SKILL/i },
  { category: 'injection', allowNegation: false, originalOnly: true, re: /(?:игнорир|забуд|отмен|обойд)\S*\s+(?:\S+\s+){0,3}(?:предыдущ|прежн|прошл|выше|системн|все)\S*\s+(?:\S+\s+){0,2}(?:инструкци|указани|правил|промпт|ограничени)/i },
  { category: 'injection', allowNegation: false, originalOnly: true, re: /\bты\s+теперь\b|системн\S*\s+промпт/i },

  // ---- delete
  { category: 'delete', allowNegation: true, re: new RegExp(`\\b(?:delete|erase|wipe|purge|destroy|overwrite|truncate|shred|unlink)\\b[^.\\n]{0,50}\\b(?:${HARD_OBJECTS})`, 'i') },
  { category: 'delete', allowNegation: true, re: new RegExp(`\\b(?:remove|clear|empty|trash|move|rename)\\b[^.\\n]{0,40}\\b(?:${SOFT_OBJECTS})`, 'i') },
  { category: 'delete', allowNegation: true, re: /\brm\s+-|\brmdir\b|\bdel\s+\/|\bshutil\.rmtree|\bos\.(?:remove|unlink)\b|\bfs\.(?:rm|unlink|rmdir)\b|\bgit\s+(?:clean|reset\s+--hard)\b|\bformat\s+[a-z]:|\bmkfs\b|\bdrop\s+table\b|\btruncate\s+table\b/i },
  { category: 'delete', allowNegation: false, originalOnly: true, re: /(?:удал|сотр|стер|очист|перезапиш|уничтож)\S*\s+(?:\S+\s+){0,3}(?:файл|папк|директор|базу|истори|данные|заметки|профил|пример)/i },

  // ---- network
  { category: 'network', allowNegation: false, re: new RegExp(`\\b(?:https?|ftp|sftp|ssh|wss?|smb|ldap|telnet|gopher|data):\\/\\/|\\bmailto:|\\bwww\\.[a-z0-9-]+\\.[a-z]{2,}`, 'i') },
  { category: 'network', allowNegation: false, re: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b|\blocalhost(?::\d+)?\b/i },
  { category: 'network', allowNegation: false, re: new RegExp(`\\b[a-z0-9][a-z0-9-]{1,}\\.(?:${TLD})\\b(?![\\w-])`) },
  { category: 'network', allowNegation: true, re: /\b(?:curl|wget|netcat|ncat|telnet|nslookup|ngrok|pastebin|axios|XMLHttpRequest|webhooks?|websockets?)\b|\brequests\.(?:get|post)\b|\bfetch\s*\(/i },
  { category: 'network', allowNegation: true, re: /\bfetch\b[^.\n]{0,40}\b(?:url|page|site|website|link|api|endpoint|from the (?:web|internet))|\b(?:http|https|api|rest|graphql|post|get)\s+(?:requests?|calls?)\b|\bapi\s+(?:endpoint|call)s?\b/i },
  { category: 'network', allowNegation: true, re: /\b(?:upload|download)(?:s|ed|ing)?\b/i },
  { category: 'network', allowNegation: true, re: /\b(?:send|post|forward|transmit|submit|push|sync|share|email|mail|text|dm|message)(?:s|ing)?\b[^.\n]{0,60}\b(?:to|at|via|through|using|with|on)\b[^.\n]{0,25}\b(?:server|endpoint|url|external|third[- ]party|remote|cloud|api|internet|online|webhook|slack|discord|telegram|whatsapp|dropbox|google drive|pastebin|s3|bucket|ftp|http|public)\b/i },
  { category: 'network', allowNegation: true, originalOnly: true, re: /(?:загруз|скача|выгруз|отправ|пересл|перешл)\S*\s+(?:\S+\s+){0,4}(?:на\s+)?(?:сервер|сайт|url|адрес|интернет|облак|вебхук|внешн)/i },

  // ---- escape
  { category: 'escape', allowNegation: false, re: /\.\.[\\/]|[\\/]\.\.(?:[\\/]|$)/ },
  { category: 'escape', allowNegation: false, re: /(?:^|[\s"'`(\[=,:])~[\\/]|\$\{?HOME\}?|%USERPROFILE%|%APPDATA%|\$USERPROFILE/i },
  { category: 'escape', allowNegation: false, re: /(?:^|[\s"'`(\[=,:])\/(?:Users|home|etc|var|tmp|usr|bin|opt|root|mnt|private|System|Library|Volumes|Applications|dev|proc|sys|srv|boot|lib)\b/ },
  { category: 'escape', allowNegation: false, re: /(?:^|[\s"'`(\[=,:])\/[A-Za-z0-9._-]+\/[A-Za-z0-9._\/-]+/ },
  { category: 'escape', allowNegation: false, re: /(?:^|[\s"'`(\[=,:])[A-Za-z]:[\\/]|\\\\[\w.-]+\\|\bfile:\/\//i },
  { category: 'escape', allowNegation: false, re: /\.ssh\b|\bid_rsa\b|\.aws\b|\.npmrc\b|\.netrc\b|(?:^|[\s"'`(\[=,:/])\.env\b|\/etc\/passwd|\bkeychain\b|\.gnupg\b|\.kube\b|\bbrowser (?:cookies|history|passwords)\b/i },
  { category: 'escape', allowNegation: true, re: /\b(?:outside|beyond|above)\s+(?:of\s+)?(?:the\s+|this\s+|your\s+|my\s+)?(?:knowledge base|base|folder|directory|workspace|sandbox)\b|\b(?:parent|root|home|system|desktop|downloads|documents)\s+(?:folder|directory)\b|\b(?:entire|whole)\s+(?:disk|computer|drive|filesystem|file system)\b|\bother (?:folders?|directories|drives?)\b/i },

  // ---- credentials
  { category: 'credentials', allowNegation: true, re: /\b(?:ask|request|require|prompt|demand|obtain|collect|provide|enter|give|supply|share|paste|type|send|tell|reveal|disclose|extract|retrieve|read|find|need|needs|must have)(?:s|ing)?\b[^.\n]{0,50}\b(?:api[\s_-]?keys?|(?:access|auth(?:entication)?|bearer|secret|session|login|oauth|jwt|api)[\s_-]?tokens?|passwords?|passphrases?|passcodes?|secrets?|credentials?|private keys?|ssh keys?|login details?|2fa|otp|one[- ]time (?:code|password)|cvv|card number|social security)\b/i },
  { category: 'credentials', allowNegation: false, re: SECRET_KEY_SHAPES },
  { category: 'credentials', allowNegation: false, re: SECRET_ASSIGNMENT },
  { category: 'credentials', allowNegation: true, originalOnly: true, re: /(?:запрос|попрос|потреб|введи|укаж|передай|сообщи|пришли)\S*\s+(?:\S+\s+){0,3}(?:пароль|парол|токен|api[\s-]?ключ|секрет|ключ доступа)/i },
];

/** Tool names that write to the base. A skill that only declares `read` must not mention them. */
const WRITE_TOOLS =
  /\bloam_(?:upsert_note|record_correction|add_example|generate_skill|log_run|save_interview|import_skill|set_skill_review)\b/;
const WRITE_VERBS = [
  /\b(?:write|save|store|append|persist|record|log|export)(?:s|ing)?\b[^.\n]{0,30}\b(?:to|into|onto)\b[^.\n]{0,20}\b(?:files?|disk|knowledge base|the base|profile|folder|memory|corrections|\.md)\b/i,
  /\b(?:create|edit|modify|update|change|rewrite|append to|add to)(?:s|ing)?\b[^.\n]{0,25}\b(?:the\s+|a\s+|your\s+|my\s+)?(?:files?|profile\.md|agents\.md|claude\.md|process\.md|corrections\.md|skill\.md|knowledge base|the base|my base|\.md files?)\b/i,
];

// Exfiltration needs two things in one paragraph: reading the base broadly, and sending something out.
// Both lists are deliberately narrow so ordinary words (copy, text, document, share with the team) are not caught.
const OUTBOUND = /\b(?:send|forward|email|post|upload|leak|transmit|exfiltrate|relay|publish|mail|share)(?:s|ing)?\b|(?:отправ|пересл|перешл|выгруз)\S*/i;
const BASE_NOUNS = 'files?|folders?|directories|knowledge base|base|profile|history|memory';
const BULK_READ = new RegExp(
  `\\b(?:read|open|scan|list|dump|collect|gather|print|cat|load|ingest|go through|go over|iterate)\\b[^.\\n]{0,40}\\b(?:all|every|each|entire|whole|full|complete|any and all)\\b[^.\\n]{0,40}\\b(?:${BASE_NOUNS})\\b|(?:прочита|считай|открой)\\S*\\s+(?:\\S+\\s+){0,2}(?:все|всё|каждый)\\s+(?:\\S+\\s+){0,2}(?:файл|заметк|документ)`,
  'i',
);
const INCLUDE_CONTENTS = new RegExp(
  `\\b(?:include|embed|append|insert|attach|add|paste|put|print|output|echo|reveal|dump|expose)\\b[^.\\n]{0,40}\\b(?:contents?|text|everything|all|entire|whole|full)\\b[^.\\n]{0,30}\\b(?:of\\s+)?(?:the\\s+|my\\s+|your\\s+|user'?s\\s+)?(?:profile|knowledge base|base|files?|folder|history|memory|corrections|entities|glossary)\\b|включ\\S*\\s+(?:\\S+\\s+){0,3}содержимое`,
  'i',
);
const SEND_SENSITIVE = /\b(?:send|forward|email|post|upload|leak|transmit|exfiltrate|share)(?:s|ing)?\b[^.\n]{0,50}\b(?:profile\.md|(?:my|your|the user'?s) profile|knowledge base|credentials|contents? of|everything|all (?:the )?(?:files|notes|data))\b/i;

const KNOWN_SYSTEMS = [
  'Slack', 'Salesforce', 'HubSpot', 'Jira', 'Asana', 'Trello', 'Notion', 'Confluence', 'Zendesk', 'Intercom',
  'Gmail', 'Outlook', 'SharePoint', 'Google Drive', 'Google Docs', 'Dropbox', 'GitHub', 'GitLab', 'Zapier',
  'Airtable', 'ClickUp', 'Figma', 'Shopify', 'Stripe', 'QuickBooks', 'Xero', 'SAP', 'Workday', 'BambooHR',
  'Greenhouse', 'Mailchimp', 'Google Analytics', 'Microsoft Teams', 'Zoom', 'Calendly',
];

const TEMPLATE_DESCRIPTION = /^(?:todo|tbd|description|describe\b|add (?:a )?description|lorem|your description|\.{3}|n\/a|none)/i;

/** Empty, too short to be useful, or still template text. */
export function isWeakDescription(description: string): boolean {
  const d = description.trim();
  return d === '' || d.length < 12 || TEMPLATE_DESCRIPTION.test(d) || d.includes(PLACEHOLDER);
}

const shorten = (line: string) => {
  const t = line.trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
};

// ---------------------------------------------------------------- scan

export function scanSkill(input: ScanInput): ScanResult {
  const red: Finding[] = [];
  const yellow: Finding[] = [];
  const seen = new Set<string>();
  const addRed = (category: RedCategory, line: number, text: string, message = RED_MESSAGE[category]) => {
    const key = `${category}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    red.push({ level: 'red', category, line, text: shorten(text), message });
  };
  const addYellow = (category: YellowCategory, line: number, text: string, message = YELLOW_MESSAGE[category]) => {
    yellow.push({ level: 'yellow', category, line, text: shorten(text), message });
  };

  if (new TextEncoder().encode(input.text).length > MAX_SKILL_BYTES) {
    addRed('size', 0, `${Math.round(MAX_SKILL_BYTES / 1000)} KB limit`);
    return { verdict: 'fail', red, yellow };
  }

  const text = normalizeText(input.text);
  const lines = text.split('\n');

  // Hidden characters can carry instructions a human reviewer never sees.
  lines.forEach((line, i) => {
    if (INVISIBLE.test(line)) {
      addRed('injection', i + 1, line.replace(INVISIBLE_G, '␣'), 'This skill contains hidden characters that can smuggle in instructions. We didn\'t add it.');
    }
  });

  // Line rules, on the original and the look-alike-folded version of each line.
  lines.forEach((line, i) => {
    const folded = skeleton(line);
    for (const rule of RULES) {
      const variants = rule.originalOnly ? [line] : folded === line ? [line] : [line, folded];
      for (const v of variants) {
        const m = rule.re.exec(v);
        if (!m) continue;
        if (rule.allowNegation && negated(v, m.index, rule.allowNegation === 'strict')) continue;
        addRed(rule.category, i + 1, line);
        break;
      }
    }
  });

  // Exfiltration needs two things in one paragraph: reading broadly + sending out.
  const paragraphs: { start: number; lines: string[] }[] = [];
  let currentPara: { start: number; lines: string[] } | null = null;
  lines.forEach((line, i) => {
    if (line.trim() === '') currentPara = null;
    else {
      if (!currentPara) {
        currentPara = { start: i, lines: [] };
        paragraphs.push(currentPara);
      }
      currentPara.lines.push(line);
    }
  });
  for (const para of paragraphs) {
    const joined = skeleton(para.lines.join(' '));
    const original = para.lines.join(' ');
    const reads = BULK_READ.exec(joined) ?? BULK_READ.exec(original) ?? INCLUDE_CONTENTS.exec(joined) ?? INCLUDE_CONTENTS.exec(original);
    const out = OUTBOUND.exec(joined) ?? OUTBOUND.exec(original);
    if (reads && out && !negated(joined, out.index)) {
      const lineIndex = para.lines.findIndex((l) => BULK_READ.test(skeleton(l)) || INCLUDE_CONTENTS.test(skeleton(l)) || BULK_READ.test(l) || INCLUDE_CONTENTS.test(l));
      const at = para.start + Math.max(0, lineIndex);
      addRed('exfiltration', at + 1, lines[at] ?? para.lines[0] ?? '');
    } else if (reads && BULK_READ.test(joined) && !negated(joined, reads.index)) {
      const lineIndex = para.lines.findIndex((l) => BULK_READ.test(skeleton(l)));
      const at = para.start + Math.max(0, lineIndex);
      addYellow('scope', at + 1, lines[at] ?? '');
    }
  }
  lines.forEach((line, i) => {
    const folded = skeleton(line);
    const m = SEND_SENSITIVE.exec(folded);
    if (m && !negated(folded, m.index)) addRed('exfiltration', i + 1, line);
  });

  // Capabilities: declared vs allowed vs what the text actually does.
  const caps = new Set(input.capabilities);
  const capLine = lines.findIndex((l) => /^capabilities\s*:/i.test(l.trim()));
  const capText = capLine >= 0 ? (lines[capLine] ?? '') : `capabilities: [${input.capabilities.join(', ')}]`;
  for (const cap of caps) {
    if (!['read', 'write', 'network'].includes(cap)) {
      addRed('capability', capLine + 1, capText, `This skill declares a permission Loam doesn't know ("${cap}"). We didn't add it.`);
    }
  }
  if (caps.has('network')) {
    addRed('capability', capLine + 1, capText, 'This skill declares network access. Loam skills can never use the network. We didn\'t add it.');
  }
  if (caps.has('write') && input.source !== 'generated') {
    addRed('capability', capLine + 1, capText, 'This skill asks for permission to write to your base. Only skills Loam builds from your own processes can do that. We didn\'t add it.');
  }
  if (!caps.has('write')) {
    lines.forEach((line, i) => {
      const hit = WRITE_TOOLS.test(line) || WRITE_VERBS.some((re) => {
        const m = re.exec(line);
        return m !== null && !negated(line, m.index);
      });
      if (hit) {
        addRed('capability', i + 1, line, 'The skill says it only reads, but its text asks your AI to write to your base. We didn\'t add it.');
      }
    });
  }

  // ---- yellow flags
  if (countWords(input.body) > BUDGET_WORDS.skill) {
    addYellow('length', 0, `${countWords(input.body)} words`);
  }
  if (isWeakDescription(input.description)) {
    addYellow('description', 0, input.description.trim() === '' ? '(empty)' : input.description.trim());
  }
  if (!input.license || input.license.trim() === '') addYellow('license', 0, '(no licence)');
  if ([...caps].some((c) => c !== 'read') && red.every((f) => f.category !== 'capability')) {
    addYellow('capabilities', capLine + 1, capText);
  }
  const lower = text.toLowerCase();
  if (/<!--/.test(text)) addYellow('hidden', lines.findIndex((l) => l.includes('<!--')) + 1, 'HTML comment');
  const blob = /[A-Za-z0-9+/]{80,}={0,2}/.exec(text);
  if (blob) addYellow('hidden', lines.findIndex((l) => l.includes(blob[0].slice(0, 40))) + 1, `${blob[0].slice(0, 40)}…`);
  for (const key of input.frontmatterKeys ?? []) {
    if (/^allowed[-_]?tools$|^tools$|^permissions?$/i.test(key)) addYellow('tools', 0, key);
  }
  if (input.profileText && !input.profileText.includes(PLACEHOLDER)) {
    const profile = input.profileText.toLowerCase();
    for (const system of KNOWN_SYSTEMS) {
      const s = system.toLowerCase();
      if (lower.includes(s) && !profile.includes(s)) {
        addYellow('unknown-system', lines.findIndex((l) => l.toLowerCase().includes(s)) + 1, system, `The skill mentions ${system}, which isn't in your profile.`);
      }
    }
  }

  return { verdict: red.length ? 'fail' : yellow.length ? 'warn' : 'pass', red, yellow };
}

/** One sentence per red finding, for an agent-facing refusal message. */
export function describeRefusal(result: ScanResult): string {
  return result.red
    .map((f) => `- ${f.message}${f.line ? ` (line ${f.line}: "${f.text}")` : ''} [${f.category}]`)
    .join('\n');
}
