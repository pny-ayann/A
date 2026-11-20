// Claude Code PreToolUse 훅: 두 가지를 막는다.
// 1) git commit / git push 직전: 올라갈 내용에 비밀 파일·비밀 값이 있으면 멈춤 (저장소가 공개라서)
// 2) 이미 서버에 적용한 supabase/migrations 파일 수정: 새 파일을 만들게 함
//    "적용한 마지막 번호"는 supabase/.applied-migration 에 적는다 (db push 뒤에 갱신).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }));
  process.exit(0);
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

// ---- 1) 비밀값 ----------------------------------------------------------------
const SECRET_FILE = /(^|\/)(\.env(\.[^/]*)?|google-services\.json|GoogleService-Info\.plist|[^/]+\.(jks|keystore|p12|pem|key))$/i;
const SECRET_FILE_OK = /(^|\/)\.env(\.[^/]*)?\.example$/i;
const SECRET_TEXT = [
  [/eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, 'Supabase 키 같은 JWT 토큰'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'Supabase 비밀 키(sb_secret_)'],
  [/\bsbp_[a-f0-9]{30,}/, 'Supabase 접속 토큰(sbp_)'],
  [/\bsk_(live|test)_[A-Za-z0-9]{10,}/, '결제 비밀 키(sk_)'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '개인 키(PRIVATE KEY)'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API 키'],
  [/\b(gh[pousr]_[A-Za-z0-9]{30,})/, 'GitHub 토큰'],
  [/\b[A-Z0-9_]*(SERVICE_ROLE|SECRET|PASSWORD|REST_KEY|ACCESS_TOKEN|PRIVATE_KEY)[A-Z0-9_]*\s*[=:]\s*['"]?[^\s'"$<{/][^\s'"]{11,}/, '비밀 이름에 값이 들어 있음'],
];

function scanDiff(diff) {
  const found = [];
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.slice(4).replace(/^b\//, ''); continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const [re, what] of SECRET_TEXT) {
      if (re.test(line)) { found.push(`${file}: ${what}`); break; }
    }
  }
  return found;
}

function checkSecrets(cmd) {
  const isCommit = /\bgit\b[^;|&]*\bcommit\b/.test(cmd);
  const isPush = /\bgit\b[^;|&]*\bpush\b/.test(cmd);
  if (!isCommit && !isPush) return;

  let files = [];
  let diff = '';
  if (isCommit) {
    files.push(...(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR']) || '').split('\n'));
    diff += git(['diff', '--cached', '-U0']) || '';
    // "git add ... && git commit" 이나 "commit -a"는 훅이 도는 순간 아직 안 올라간 변경도 함께 들어간다
    if (/\bgit\b[^;|&]*\badd\b/.test(cmd) || /\scommit\b[^;|&]*\s(-a|--all|-[a-zA-Z]*a[a-zA-Z]*)\b/.test(cmd)) {
      files.push(...(git(['diff', '--name-only', '--diff-filter=ACMR']) || '').split('\n'));
      diff += git(['diff', '-U0']) || '';
      for (const f of (git(['ls-files', '--others', '--exclude-standard']) || '').split('\n').map(s => s.trim()).filter(Boolean)) {
        files.push(f);
        try {
          const text = readFileSync(path.join(root, f), 'utf8');
          if (text.length < 2 * 1024 * 1024) diff += `+++ b/${f}\n` + text.split('\n').map(l => '+' + l).join('\n') + '\n';
        } catch { /* 읽을 수 없는 파일은 이름만 검사 */ }
      }
    }
  }
  if (isPush) {
    const base = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])?.trim() || 'origin/main';
    const range = `${base}...HEAD`;
    files.push(...(git(['diff', '--name-only', '--diff-filter=ACMR', range]) || '').split('\n'));
    diff += git(['diff', '-U0', range]) || '';
  }

  files = [...new Set(files.map(f => f.trim()).filter(Boolean))];
  const badFiles = files.filter(f => SECRET_FILE.test(f) && !SECRET_FILE_OK.test(f));
  const badText = [...new Set(scanDiff(diff))];
  if (badFiles.length === 0 && badText.length === 0) return;

  const lines = [
    ...badFiles.map(f => `- 비밀 파일: ${f}`),
    ...badText.slice(0, 10).map(t => `- ${t}`),
  ];
  deny(
    '공개 저장소에 비밀값이 올라갈 수 있어 멈췄어요.\n' + lines.join('\n') +
    '\n해당 파일을 빼거나(git restore --staged <파일>), 값을 .env 파일로 옮긴 뒤 다시 하세요. ' +
    '정말 비밀이 아니면 사용자에게 확인을 받고, 사용자가 직접 커밋하게 하세요.'
  );
}

// ---- 2) 적용한 서버 규칙 파일 -------------------------------------------------------
function checkMigration(filePath) {
  if (!filePath) return;
  const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join('/');
  const m = /^supabase\/migrations\/(\d{14})_[^/]+\.sql$/.exec(rel);
  if (!m) return;
  const marker = path.join(root, 'supabase', '.applied-migration');
  if (!existsSync(marker)) return;
  const applied = (readFileSync(marker, 'utf8').match(/\d{14}/) || [])[0];
  if (!applied || m[1] > applied) return;
  deny(
    `${rel} 은(는) 이미 개발 서버에 적용된 규칙 파일이에요(적용한 마지막 번호 ${applied}). ` +
    '고치면 서버와 코드가 달라지니, 바꿀 내용은 다음 번호의 새 마이그레이션 파일로 만드세요.'
  );
}

// ---- main --------------------------------------------------------------------
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => {
  let data;
  try { data = JSON.parse(input); } catch { process.exit(0); }
  const tool = data.tool_name || '';
  const ti = data.tool_input || {};
  if (tool === 'Bash' || tool === 'PowerShell') checkSecrets(String(ti.command || ''));
  else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) checkMigration(ti.file_path || ti.notebook_path);
  process.exit(0);
});
