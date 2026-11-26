'use strict';
    const el = id => document.getElementById(id);
    const state = { sources:[], filter:{search:'',meeting:'',type:'',turma:'',formador:'',componente:'',source:'',topic:''}, shown:24, nextId:1 };
    const colors = { positive:'#34d399',attention:'#fbbf24',alert:'#fb7185',other:'#a78bfa' };
    const TYPES = ['Prática / Elogio','Sugestão / Ajuste','Alerta','Não classificado'];
    const TOPICS = [
      {name:'ENEM',test:/\benem\b/i},
      {name:'Ética',test:/\b[ée]tica\b/i},
      {name:'Tempo / ritmo',test:/\btempo\b|\britmo\b|\bcarga\s+hor[aá]ria\b|\bsobrecarga\b/i},
      {name:'Troca de experiências',test:/\btroca\b|\bexperi[eê]ncias\b/i},
      {name:'Leitura / textos',test:/\bleitura\b|\btextos?\b/i},
      {name:'Metodologias',test:/\bmetodolog\w*\b|\bestrat[eé]gias?\b/i},
      {name:'Diálogo / debate',test:/\bdi[aá]logo\b|\bdebat\w*\b/i}
    ];
    function normalize(value) {
      return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    }
    function trim(value) {return String(value??'').trim();}
    const keys = {
      reuniao:['reuniao','encontro','numero da reuniao','n reuniao','nr reuniao','numero encontro','data da reuniao','meeting'],
      tipo:['tipo','tipo de feedback','classificacao','classificacao do relato','categoria','natureza do feedback','avaliacao','sentimento','type','classification'],
      relato:['relato','feedback','texto','comentario','depoimento','percepcao','observacao','observacoes','resposta','resposta descritiva','descricao','sugestao','registro','mensagem','o que voce achou','feedback do cursista','consideracoes','text','comment','response'],
      turma:['turma','grupo','codigo da turma','classe','class','group'],
      formador:['formador','formadora','nome do formador','nome da formadora','professor formador','responsavel','trainer','facilitator'],
      componente:['componente','componente curricular','disciplina','area de conhecimento','materia','component','subject']
    };
    function fieldFor(header) {
      const n = normalize(header);
      if (!n) return null;
      for (const [field, names] of Object.entries(keys)) {
        if (names.includes(n)) return field;
      }
      if (/feedback|comentario|relato|depoimento|observac|percepcao|resposta aberta/.test(n)) return 'relato';
      if (/formador|formadora/.test(n)) return 'formador';
      if (/componente curricular|disciplina/.test(n)) return 'componente';
      if (/reuniao|encontro/.test(n)) return 'reuniao';
      if (/classificac|categoria|tipo/.test(n)) return 'tipo';
      if (/turma/.test(n)) return 'turma';
      return null;
    }
    function kindOf(raw) {
      const n = normalize(raw);
      if (!n) return 'Não classificado';
      if (/alerta|critic|problema|sobrecarga|dificuldade|insatisf|negativ/.test(n)) return 'Alerta';
      if (/sugest|ajuste|melhoria|recomend|proposta|oportunidade/.test(n)) return 'Sugestão / Ajuste';
      if (/elogio|pratica|positiv|satisfa|excelente|aprovad|bom/.test(n)) return 'Prática / Elogio';
      return 'Não classificado';
    }
    function cleanMeeting(raw) {const s=trim(raw);return /^\d{1,3}$/.test(s)?'Reunião '+s:s;}
    function record(obj, sourceName) {
      const r={reuniao:cleanMeeting(obj.reuniao),tipoRaw:trim(obj.tipo),relato:trim(obj.relato),turma:trim(obj.turma),formador:trim(obj.formador),componente:trim(obj.componente),source:sourceName};
      if (!r.relato) return null;
      r.tipo=kindOf(r.tipoRaw);
      r.topics=TOPICS.filter(t=>t.test.test(r.relato)).map(t=>t.name);
      return r;
    }
    function objectsFromMatrix(matrix, sourceName) {
      const rows=matrix.map(row=>Array.isArray(row)?row:[]).filter(row=>row.some(cell=>trim(cell)));
      if (!rows.length) return [];
      let headerAt=-1, mapping={};
      for (let i=0;i<Math.min(rows.length,12);i++) {
        const proposed={};
        rows[i].forEach((cell,j)=>{const field=fieldFor(cell);if(field && proposed[field]===undefined)proposed[field]=j;});
        if (proposed.relato!==undefined && Object.keys(proposed).length>=2) {headerAt=i;mapping=proposed;break;}
      }
      if (headerAt<0) {
        // Compatibilidade com o formato original: Reunião, Tipo, Relato, Turma.
        if (rows[0].length>=3 && !rows[0].some(c=>fieldFor(c))) mapping={reuniao:0,tipo:1,relato:2,turma:3,formador:4,componente:5};
        else throw new Error('Cabeçalhos não reconhecidos. Inclua uma coluna chamada “relato”, “feedback” ou “comentário”.');
      }
      const parsed=[];
      for (let i=headerAt+1;i<rows.length;i++) {
        const obj={};
        for (const [field,index] of Object.entries(mapping)) obj[field]=rows[i][index]??'';
        const item=record(obj,sourceName);if(item)parsed.push(item);
      }
      return parsed;
    }
    function detectDelimiter(text) {
      const line=text.split(/\r?\n/,1)[0]||'';
      const counts=[',',';','\t'].map(d=>({d,c:0}));
      let quoted=false;
      for(let i=0;i<line.length;i++){
        if(line[i]==='"'){if(quoted&&line[i+1]==='"'){i++;continue;}quoted=!quoted;}
        else if(!quoted){const found=counts.find(c=>c.d===line[i]);if(found)found.c++;}
      }
      counts.sort((a,b)=>b.c-a.c);return counts[0].c?counts[0].d:',';
    }
    function csvMatrix(text,delimiter) {
      const rows=[],row=[];let cell='',quoted=false;
      const source=text.replace(/^\uFEFF/,'');
      for(let i=0;i<source.length;i++){
        const c=source[i];
        if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
        else if(c===delimiter&&!quoted){row.push(cell);cell='';}
        else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&source[i+1]==='\n')i++;row.push(cell);rows.push(row.splice(0));cell='';}
        else cell+=c;
      }
      if(quoted)throw new Error('CSV com aspas não fechadas.');
      if(cell.length||row.length){row.push(cell);rows.push(row);}
      return rows;
    }
    function getJsonRows(data,sourceName) {
      const arr=Array.isArray(data)?data:[data?.feedbacks,data?.relatos,data?.registros,data?.dados,data?.items].find(Array.isArray);
      if(!Array.isArray(arr))throw new Error('JSON precisa conter uma lista de feedbacks ou uma propriedade “feedbacks”, “relatos”, “registros” ou “dados”.');
      return arr.map(item=>{
        if(!item||typeof item!=='object'||Array.isArray(item))return null;
        const obj={};
        for(const [key,value] of Object.entries(item)){
          const field=fieldFor(key);if(field&&obj[field]===undefined)obj[field]=value;
        }
        return record(obj,sourceName);
      }).filter(Boolean);
    }
    function decodeText(buffer) {
      let value=new TextDecoder('utf-8').decode(buffer);
      if(value.includes('\uFFFD'))value=new TextDecoder('windows-1252').decode(buffer);
      return value;
    }
    async function readFile(file) {
      if(file.size>25*1024*1024)throw new Error('Arquivo maior que 25 MB.');
      const suffix=file.name.split('.').pop().toLowerCase();
      if(!['csv','txt','json','xlsx','xlsm'].includes(suffix))throw new Error('Formato não aceito.');
      const buffer=await file.arrayBuffer(),name=file.name;
      if(suffix==='json')return getJsonRows(JSON.parse(decodeText(buffer)),name);
      if(suffix==='csv'||suffix==='txt') {
        const text=decodeText(buffer);return objectsFromMatrix(csvMatrix(text,detectDelimiter(text)),name);
      }
      if(!window.XLSX)throw new Error('A biblioteca de leitura Excel não carregou. Verifique a conexão com a internet ou salve a planilha como CSV.');
      const workbook=window.XLSX.read(new Uint8Array(buffer),{type:'array',cellDates:false});
      const all=[];let recognized=0;
      for(const sheetName of workbook.SheetNames){
        const matrix=window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,raw:false,blankrows:false,defval:''});
        if(!matrix.length)continue;
        try {const rows=objectsFromMatrix(matrix,name);if(rows.length){all.push(...rows);recognized++;}}catch(err){/* outra aba pode ser apenas informativa */}
      }
      if(!recognized)throw new Error('Nenhuma aba contém a coluna de relatos esperada. Confira o modelo CSV.');
      return all;
    }
    async function importFiles(fileList){
      const files=Array.from(fileList||[]);
      if(!files.length)return;
      el('chooseFilesBtn').disabled=true;el('dropZone').classList.add('loading');
      let added=0;const errors=[];
      try {
        for(const file of files){
          try {
            const rows=await readFile(file);
            if(!rows.length)throw new Error('Nenhum relato válido encontrado.');
            const existing=state.sources.findIndex(item=>item.name===file.name);
            if(existing>=0)state.sources.splice(existing,1);
            state.sources.push({id:state.nextId++,name:file.name,rows});added+=rows.length;
          } catch(err){errors.push(file.name+': '+err.message);}
        }
        state.shown=24;resetFilters(false);render();
        if(errors.length)showMessage((added?added+' relato(s) importado(s).\n':'')+errors.join('\n'),added?'warn':'error');
        else showMessage(added+' relato(s) importado(s) de '+files.length+' arquivo(s). Os indicadores foram recalculados.','success');
      } finally {el('chooseFilesBtn').disabled=false;el('dropZone').classList.remove('loading');el('fileInput').value='';}
    }
    function showMessage(message,mode){const e=el('message');e.textContent=message;e.className='status'+(mode==='error'?' error':mode==='warn'?' warn':'');e.hidden=false;}
    function allRows(){return state.sources.flatMap(s=>s.rows.map(r=>({...r,sourceId:String(s.id)})));}
    function sortAlpha(a,b){return String(a).localeCompare(String(b),'pt-BR',{numeric:true,sensitivity:'base'});}
    function createOptions(id,values,placeholder,selected){const select=el(id);select.replaceChildren();const first=document.createElement('option');first.value='';first.textContent=placeholder;select.append(first);[...new Set(values.filter(Boolean))].sort(sortAlpha).forEach(v=>{const option=document.createElement('option');option.value=v;option.textContent=v;select.append(option);});select.value=selected||'';if(select.selectedIndex<0)select.value='';}
    function getFilteredRows(ignoreTopic=false){
      const q=normalize(state.filter.search);
      return allRows().filter(r=>{
        const f=state.filter;
        return (!q||normalize([r.relato,r.reuniao,r.tipoRaw,r.turma,r.formador,r.componente].join(' ')).includes(q))
          &&(!f.meeting||r.reuniao===f.meeting)&&(!f.type||r.tipo===f.type)&&(!f.turma||r.turma===f.turma)
          &&(!f.formador||r.formador===f.formador)&&(!f.componente||r.componente===f.componente)
          &&(!f.source||r.sourceId===f.source)&&(ignoreTopic||!f.topic||r.topics.includes(f.topic));
      });
    }
    function summary(rows){
      const counts=Object.fromEntries(TYPES.map(t=>[t,0]));const meetings=new Map();const topics=new Map();
      rows.forEach(r=>{counts[r.tipo]++;if(r.reuniao)meetings.set(r.reuniao,(meetings.get(r.reuniao)||0)+1);r.topics.forEach(t=>topics.set(t,(topics.get(t)||0)+1));});
      const classified=rows.length-counts['Não classificado'];
      return {count:rows.length,counts,classified,meetings,topics};
    }
    const number=new Intl.NumberFormat('pt-BR');
    function updateMetrics(sum){
      el('totalMetric').textContent=number.format(sum.count);
      el('totalNote').textContent='Registros na seleção atual';
      el('meetingMetric').textContent=number.format(sum.meetings.size);
      const positive=sum.counts['Prática / Elogio'],attention=sum.counts['Sugestão / Ajuste']+sum.counts['Alerta'];
      el('positiveMetric').textContent=sum.classified?(100*positive/sum.classified).toFixed(1).replace('.',',')+'%':'—';
      el('positiveNote').textContent=sum.classified?positive+' de '+sum.classified+' classificados':'Sem tipos reconhecidos';
      el('attentionMetric').textContent=sum.classified?(100*attention/sum.classified).toFixed(1).replace('.',',')+'%':'—';
      el('attentionNote').textContent=sum.classified?attention+' de '+sum.classified+' classificados':'Sem tipos reconhecidos';
    }
    function updateCharts(sum){
      const box=el('meetingBars');box.replaceChildren();
      const ordered=[...sum.meetings].sort((a,b)=>sortAlpha(a[0],b[0]));const peak=Math.max(1,...ordered.map(x=>x[1]));
      if(!ordered.length){const p=document.createElement('p');p.className='muted';p.textContent='Nenhuma reunião identificada nos registros selecionados.';box.append(p);}
      ordered.forEach(([label,count])=>{
        const line=document.createElement('div');line.className='bar-row';
        const name=document.createElement('span');name.className='bar-row-label';name.textContent=label;
        const track=document.createElement('div');track.className='bar-track';track.setAttribute('role','img');track.setAttribute('aria-label',label+': '+count+' relato(s)');
        const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=(100*count/peak)+'%';track.append(fill);
        const n=document.createElement('span');n.className='bar-number';n.textContent=number.format(count);
        line.append(name,track,n);box.append(line);
      });
      const items=[['Prática / Elogio',sum.counts['Prática / Elogio'],colors.positive],['Sugestão / Ajuste',sum.counts['Sugestão / Ajuste'],colors.attention],['Alerta',sum.counts['Alerta'],colors.alert]];
      let accumulated=0;const stops=[];
      for(const [,n,color] of items){if(!n||!sum.classified)continue;const end=accumulated+100*n/sum.classified;stops.push(color+' '+accumulated+'% '+end+'%');accumulated=end;}
      el('typeDonut').style.background=stops.length?'conic-gradient('+stops.join(',')+')':'#273249';
      el('donutCenter').replaceChildren();const main=document.createElement('span');main.textContent=number.format(sum.classified);const small=document.createElement('small');small.textContent='classificados';el('donutCenter').append(main,small);
      const legend=el('typeLegend');legend.replaceChildren();
      items.forEach(([label,count,color])=>{
        if(!count)return;
        const row=document.createElement('div');row.className='legend-row';
        const dot=document.createElement('span');dot.className='dot';dot.style.background=color;
        const text=document.createElement('span');text.textContent=label+': '+number.format(count)+' ('+(100*count/sum.classified).toFixed(1).replace('.',',')+'%)';row.append(dot,text);legend.append(row);
      });
      if(sum.counts['Não classificado']){
        const row=document.createElement('div');row.className='legend-row';const dot=document.createElement('span');dot.className='dot';dot.style.background='#64748b';const text=document.createElement('span');text.textContent='Não classificados: '+number.format(sum.counts['Não classificado']);row.append(dot,text);legend.append(row);
      }
      if(!sum.count){const p=document.createElement('div');p.className='muted';p.textContent='Nenhum dado para os filtros selecionados.';legend.append(p);}
    }
    function makeTag(text,classification){const chip=document.createElement('span');chip.className='tag '+(classification||'');chip.textContent=text;return chip;}
    function makeCard(r){
      const card=document.createElement('article');card.className='feedback-card';
      const tags=document.createElement('div');tags.className='feedback-head';
      tags.append(makeTag(r.reuniao||'Reunião não informada'));
      tags.append(makeTag(r.tipo,r.tipo==='Prática / Elogio'?'positive':r.tipo==='Alerta'?'warning':'neutral'));
      if(r.componente)tags.append(makeTag(r.componente,'neutral'));
      const quote=document.createElement('p');quote.className='quote';quote.textContent='“'+r.relato+'”';
      const meta=document.createElement('div');meta.className='meta';
      [['Turma',r.turma],['Formador',r.formador],['Arquivo',r.source]].forEach(([name,value])=>{const span=document.createElement('span');span.textContent=name+': '+(value||'Não informado');meta.append(span);});
      card.append(tags,quote,meta);return card;
    }
    function updateFeedbacks(rows){
      const list=el('feedbackList');list.replaceChildren();
      rows.slice(0,state.shown).forEach(r=>list.append(makeCard(r)));
      el('resultCount').textContent=number.format(rows.length)+' de '+number.format(allRows().length)+' relatos';
      el('noResults').hidden=rows.length!==0;
      el('moreBtn').hidden=rows.length<=state.shown;
      if(!el('moreBtn').hidden)el('moreBtn').textContent='Ver mais relatos ('+number.format(rows.length-state.shown)+' restantes)';
    }
    function updateTopics(rows){
      // As opções são criadas apenas se temas efetivamente aparecerem nos arquivos.
      const counts=summary(rows).topics;const container=el('topicFilters');container.replaceChildren();
      if(!counts.size)return;
      const all=document.createElement('button');all.className='topic'+(!state.filter.topic?' selected':'');all.textContent='Todos os temas';all.type='button';all.onclick=()=>{state.filter.topic='';state.shown=24;renderResults();};container.append(all);
      [...counts].sort((a,b)=>b[1]-a[1]).forEach(([name,count])=>{
        const button=document.createElement('button');button.type='button';button.className='topic'+(state.filter.topic===name?' selected':'');button.textContent=name+' · '+count;
        button.onclick=()=>{state.filter.topic=state.filter.topic===name?'':name;state.shown=24;renderResults();};container.append(button);
      });
    }
    function fillFilters(rows){
      createOptions('meetingFilter',rows.map(r=>r.reuniao),'Todas as reuniões',state.filter.meeting);
      createOptions('typeFilter',rows.map(r=>r.tipo),'Todas as classificações',state.filter.type);
      createOptions('classFilter',rows.map(r=>r.turma),'Todas as turmas',state.filter.turma);
      createOptions('trainerFilter',rows.map(r=>r.formador),'Todos os formadores',state.filter.formador);
      createOptions('componentFilter',rows.map(r=>r.componente),'Todos os componentes',state.filter.componente);
      const select=el('sourceFilter');select.replaceChildren();let option=document.createElement('option');option.value='';option.textContent='Todos os arquivos';select.append(option);
      state.sources.forEach(s=>{option=document.createElement('option');option.value=String(s.id);option.textContent=s.name;select.append(option);});
      select.value=state.filter.source;if(select.selectedIndex<0)select.value='';
      el('searchInput').value=state.filter.search;
    }
    function renderSources(){
      const list=el('sourceList');list.replaceChildren();
      const count=allRows().length;
      el('sourceDescription').textContent=number.format(state.sources.length)+' arquivo(s) · '+number.format(count)+' relato(s) na base';
      state.sources.forEach(source=>{
        const chip=document.createElement('div');chip.className='file-line';
        const name=document.createElement('strong');name.textContent=source.name;
        const count=document.createElement('span');count.textContent=source.rows.length+' relato(s)';
        const remove=document.createElement('button');remove.type='button';remove.textContent='Remover';remove.setAttribute('aria-label','Remover arquivo '+source.name);
        remove.addEventListener('click',()=>{state.sources=state.sources.filter(s=>s.id!==source.id);resetFilters(false);render();showMessage('Arquivo removido: '+source.name+'. Indicadores atualizados.','success');});
        chip.append(name,count,remove);list.append(chip);
      });
    }
    function renderResults(){
      const rows=getFilteredRows(),sum=summary(rows);
      updateMetrics(sum);updateCharts(sum);updateFeedbacks(rows);updateTopics(getFilteredRows(true));
      el('synthesisBtn').disabled=!rows.length;
    }
    function render(){
      const hasData=state.sources.length>0;
      el('dashboard').hidden=!hasData;el('emptyView').hidden=hasData;el('clearBtn').hidden=!hasData;
      el('uploadHeading').textContent=hasData?'Adicionar ou atualizar arquivos':'Importe os arquivos para começar';
      if(!hasData)return;
      renderSources();fillFilters(allRows());renderResults();
    }
    function resetFilters(shouldRender=true){
      state.filter={search:'',meeting:'',type:'',turma:'',formador:'',componente:'',source:'',topic:''};state.shown=24;
      if(shouldRender)render();
    }
    function synthesisText(rows){
      const s=summary(rows),pct=(n)=>s.classified?(100*n/s.classified).toFixed(1).replace('.',',')+'%':'não calculável';
      const meetings=[...s.meetings].sort((a,b)=>b[1]-a[1]);
      const topics=[...s.topics].sort((a,b)=>b[1]-a[1]);
      const formadores=[...new Set(rows.map(r=>r.formador).filter(Boolean))].sort(sortAlpha);
      const componentes=[...new Set(rows.map(r=>r.componente).filter(Boolean))].sort(sortAlpha);
      return [
        'SÍNTESE DESCRITIVA PARA A GESTÃO',
        'Base: '+state.sources.length+' arquivo(s); '+s.count+' relato(s) na seleção atual.',
        'Reuniões distintas informadas: '+s.meetings.size+'.'+(meetings.length?' Maior quantidade: '+meetings[0][0]+' ('+meetings[0][1]+' relatos).':''),
        'Classificação: '+s.classified+' relato(s) com tipo reconhecido e '+s.counts['Não classificado']+' não classificado(s).',
        'Práticas / elogios: '+s.counts['Prática / Elogio']+' ('+pct(s.counts['Prática / Elogio'])+' dos classificados).',
        'Sugestões / ajustes: '+s.counts['Sugestão / Ajuste']+' ('+pct(s.counts['Sugestão / Ajuste'])+' dos classificados).',
        'Alertas: '+s.counts['Alerta']+' ('+pct(s.counts['Alerta'])+' dos classificados).',
        'Temas mencionados (identificação por palavras-chave): '+(topics.length?topics.slice(0,5).map(([t,n])=>t+' ('+n+')').join('; '):'nenhum dos temas predefinidos foi identificado')+'.',
        'Formadores identificados: '+(formadores.length?formadores.join('; '):'não informado')+'.',
        'Componentes identificados: '+(componentes.length?componentes.join('; '):'não informado')+'.',
        'Nota metodológica: dados calculados dos arquivos enviados. Classificação depende do campo tipo; termos em relatos não são interpretados como uma avaliação automática. Textos não foram inferidos, inventados ou reescritos.'
      ].join('\n\n');
    }
    function openSynthesis(){
      const rows=getFilteredRows();if(!rows.length)return;
      const content=el('synthesisContent');content.replaceChildren();
      synthesisText(rows).split('\n\n').slice(1).forEach(line=>{const p=document.createElement('p');p.textContent=line;content.append(p);});
      el('synthesisDialog').showModal();
    }
    function downloadFile(name,contents,mime){
      const blob=new Blob(['\uFEFF',contents],{type:mime});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    el('chooseFilesBtn').addEventListener('click',()=>el('fileInput').click());
    el('fileInput').addEventListener('change',e=>importFiles(e.target.files));
    for(const event of ['dragenter','dragover'])el('dropZone').addEventListener(event,e=>{e.preventDefault();el('dropZone').classList.add('drag-over');});
    for(const event of ['dragleave','drop'])el('dropZone').addEventListener(event,e=>{e.preventDefault();el('dropZone').classList.remove('drag-over');});
    el('dropZone').addEventListener('drop',e=>importFiles(e.dataTransfer.files));
    el('templateBtn').addEventListener('click',()=>downloadFile('modelo_feedbacks.csv','reuniao;tipo;relato;turma;formador;componente\r\n','text/csv;charset=utf-8'));
    el('clearBtn').addEventListener('click',()=>{if(!confirm('Remover todos os arquivos e indicadores deste painel?'))return;state.sources=[];resetFilters(false);render();el('message').hidden=true;});
    el('resetFiltersBtn').addEventListener('click',()=>resetFilters());
    const bindings={searchInput:'search',meetingFilter:'meeting',typeFilter:'type',classFilter:'turma',trainerFilter:'formador',componentFilter:'componente',sourceFilter:'source'};
    Object.entries(bindings).forEach(([id,key])=>el(id).addEventListener(id==='searchInput'?'input':'change',e=>{state.filter[key]=e.target.value;state.shown=24;renderResults();}));
    el('moreBtn').addEventListener('click',()=>{state.shown+=24;updateFeedbacks(getFilteredRows());});
    el('synthesisBtn').addEventListener('click',openSynthesis);
    el('closeDialogBtn').addEventListener('click',()=>el('synthesisDialog').close());
    el('downloadSynthesisBtn').addEventListener('click',()=>downloadFile('sintese_filosofia.txt',synthesisText(getFilteredRows()),'text/plain;charset=utf-8'));
    render();
