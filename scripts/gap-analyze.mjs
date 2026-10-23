import fs from 'fs'
function parsePo(content){const map={};const lines=content.replace(/\r\n/g,'\n').split('\n');let key='',val='',inStr=false;for(const line of lines){if(line.startsWith('msgid ')){if(key&&val)map[key]=val;key=unq(line.slice(6));val='';inStr=false}else if(line.startsWith('msgstr ')){val=unq(line.slice(7));inStr=true}else if(inStr&&line.startsWith('"')&&line.endsWith('"')){val+=unq(line)}}if(key&&val)map[key]=val;return map}
function unq(s){s=s.trim();if(s.startsWith('"'))s=s.slice(1);if(s.endsWith('"'))s=s.slice(0,-1);return s.replace(/\\"/g,'"')}
const sftpEn=new Set(Object.values(parsePo(fs.readFileSync('../tabby-FTPS+/locale/en-US.po','utf8'))))
const src=fs.readFileSync('src/qc-i18n.service.ts','utf8')
const body=src.match(/'en-US':\s*\{([\s\S]*?)\n  \}/)[1]
const kvRe=/'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g
let x,gaps=[],hit=[]
while((x=kvRe.exec(body))){if(x[1].startsWith('panel.memory_'))continue; if(sftpEn.has(x[2]))hit.push(x[2]); else gaps.push(x[2])}
console.log('HIT in SFTP ('+hit.length+'):'); hit.forEach(g=>console.log('  + '+g))
console.log('\nGAP not in SFTP ('+gaps.length+'):'); gaps.forEach(g=>console.log('  | '+g))
