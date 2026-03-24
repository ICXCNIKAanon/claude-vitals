const NAMED_COLORS: Record<string, string> = {
  black: '30', red: '31', green: '32', yellow: '33',
  blue: '34', magenta: '35', cyan: '36', white: '37',
  gray: '90', grey: '90',
};

interface ColorOpts {
  bold?: boolean;
  dim?: boolean;
}

export function c(color: string, text: string, opts?: ColorOpts): string {
  let prefix = '';
  if (opts?.bold) prefix += '\x1b[1m';
  if (opts?.dim) prefix += '\x1b[2m';

  let colorCode: string;

  if (NAMED_COLORS[color]) {
    colorCode = `\x1b[${NAMED_COLORS[color]}m`;
  } else if (color.startsWith('#') && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    colorCode = `\x1b[38;2;${r};${g};${b}m`;
  } else if (/^\d+$/.test(color) && parseInt(color) <= 255) {
    colorCode = `\x1b[38;5;${color}m`;
  } else {
    colorCode = '';
  }

  return `${prefix}${colorCode}${text}\x1b[0m`;
}

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export function visibleLength(text: string): number {
  const plain = stripAnsi(text);
  let len = 0;
  for (const ch of plain) {
    const code = ch.codePointAt(0)!;
    if (isDoubleWidth(code)) {
      len += 2;
    } else {
      len += 1;
    }
  }
  return len;
}

function isDoubleWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  );
}
