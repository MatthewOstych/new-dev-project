// PostToolUse на Edit/Write: правка файла схемы Drizzle напоминает про
// /schema-change. Правило «обнови документацию в том же изменении» нарушается
// чаще других, и держать его памятью агента ненадёжно.
//
// Заодно проверяется развилка миграций с другими ветками: узнать о ней нужно до
// db:generate, а не при мерже. Вывод идёт через additionalContext, потому что
// простой stdout у PostToolUse агент не видит.
import { checkMigrationFork } from '../../scripts/migrations-fork.mjs';

const SCHEMA_DIR = /{{DB_DIR_REGEX}}\/src\/schema\//;

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let file = '';
  try {
    file = JSON.parse(raw)?.tool_input?.file_path ?? '';
  } catch {
    // не наш формат, молчим
  }
  if (!SCHEMA_DIR.test(file)) return;

  const lines = [
    'Schema file changed: run /schema-change (fork check, db:generate, read the SQL, db:migrate, db-scheme notes in the same diff).',
  ];
  let problems = [];
  try {
    problems = checkMigrationFork({ fetch: true });
  } catch {
    // сломанная проверка не должна мешать правке
  }
  if (problems.length > 0) {
    lines.push(
      'Migration fork with another branch, resolve before db:generate:',
      ...problems.map((p) => `- ${p}`),
    );
  }
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: lines.join('\n') },
    }),
  );
});
