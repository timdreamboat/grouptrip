#!/bin/sh
# Fast checks that need no browser. Run from the repo root: sh .claude/skills/gigtrip-qa/scripts/static-check.sh
set -e
MOCK=gigtrip/mock/index.html
TMP=$(mktemp -t gigtrip-qa).js
node -e "const s=require('fs').readFileSync('$MOCK','utf8'); require('fs').writeFileSync('$TMP', s.slice(s.indexOf('<script>')+8, s.lastIndexOf('</script>')));"
node --check "$TMP" && echo "syntax: ok"
# The file must declare its encoding: without it, any host but GitHub Pages shows "Â·" for every "·".
head -c 200 $MOCK | grep -q '<meta charset="utf-8">' && echo "charset: ok" || { echo "charset: missing <meta charset=\"utf-8\"> at the top"; exit 1; }
# One <style>, one <script>: the Pages workflow wraps the file, so stray tags break the live page.
[ "$(grep -c '</style>' $MOCK)" = "1" ] && echo "styles: ok" || { echo "styles: expected exactly one </style>"; exit 1; }
[ "$(grep -c '</script>' $MOCK)" = "1" ] && echo "script: ok" || { echo "script: expected exactly one </script>"; exit 1; }
# Every page in a nav list must have a view and help text.
node -e "
const s=require('fs').readFileSync('$MOCK','utf8');
const views=new Set([...s.matchAll(/^V\.([a-z]+) = /gm)].map(m=>m[1]));
const help=new Set([...s.matchAll(/^  ([a-z]+): \{ what:/gm)].map(m=>m[1]));
const navPages=new Set([...s.matchAll(/\['([a-z]+)', '[^']+'\]/g)].map(m=>m[1]).filter(k=>views.has(k)||k==='more'));
const missingView=[...navPages].filter(k=>!views.has(k)&&k!=='more');
const missingHelp=[...views].filter(k=>!help.has(k)&&!['about','more'].includes(k));
if(missingView.length){console.log('pages without a view:',missingView.join(', '));process.exit(1)}
if(missingHelp.length){console.log('pages without help text:',missingHelp.join(', '));process.exit(1)}
console.log('pages + help: ok ('+views.size+' views)');
"
# Hard-coded colours outside the token blocks break dark mode; only the known white/black on red/yellow are allowed.
EXTRA=$(awk 'NR>61' $MOCK | grep -o '#[0-9a-fA-F]\{3,6\}\b' | grep -v -e '#fff\b' -e '#141414' | sort -u | tr '\n' ' ')
[ -z "$EXTRA" ] && echo "colours: ok" || { echo "colours: hard-coded $EXTRA (use a token so dark mode works)"; exit 1; }
# The live site must still publish the mock.
grep -q 'gigtrip/mock/index.html' .github/workflows/pages.yml && echo "pages workflow: ok" || { echo "pages workflow: mock no longer published"; exit 1; }
rm -f "$TMP"
