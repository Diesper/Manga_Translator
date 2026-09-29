'use strict';

const path = require('path');

function classifyLine(line, relative) {
  const text = line.trim();
  const ext = path.extname(relative).toLowerCase();

  if (!text) return 'blank';
  if (/^(?:\/\/|\/\*|\*|\*\/|<!--|-->)/.test(text)) return 'comment';
  if ((ext === '.yml' || ext === '.yaml') && text.startsWith('#')) return 'comment';
  if (text === "'use strict';" || text === '"use strict";') return 'strict';
  if (/\bimportScripts\s*\(/.test(text)) return 'importScripts';
  if (/\brequire\s*\(/.test(text)) return 'require';
  if (/\bmodule\.exports\b|\bexports\./.test(text)) return 'export';
  if (/\bchrome\.[A-Za-z]/.test(text)) return 'chrome';
  if (/\bMutationObserver\b/.test(text)) return 'observer';
  if (/\bindexedDB\b|\bIndexedDB\b|gtcIndexedDb/i.test(text)) return 'indexeddb';
  if (/\bchrome\.storage\b|\bstorage\.(?:local|sync)\b/i.test(text)) return 'storage';
  if (/\bfetch\s*\(/.test(text)) return 'fetch';
  if (/\baddEventListener\s*\(/.test(text)) return 'listener';
  if (/\bsetTimeout\s*\(|\bsetInterval\s*\(|\bchrome\.alarms\b/.test(text)) return 'timer';
  if (/\bPromise\.all\s*\(/.test(text)) return 'promiseAll';
  if (/\bawait\b/.test(text)) return 'await';
  if (/^\s*try\b/.test(line)) return 'try';
  if (/^\s*catch\b/.test(line)) return 'catch';
  if (/^\s*finally\b/.test(line)) return 'finally';
  if (/\bthrow\b/.test(text)) return 'throw';
  if (/^\s*if\s*\(/.test(line)) return 'if';
  if (/^\s*else\b/.test(line)) return 'else';
  if (/^\s*switch\s*\(/.test(line)) return 'switch';
  if (/^\s*(?:case\b|default\s*:)/.test(line)) return 'case';
  if (/^\s*(?:for|while)\b/.test(line)) return 'loop';
  if (/\breturn\b/.test(text)) return 'return';
  if (/\b(?:const|let|var)\s+[A-Za-z_$]/.test(text)) return 'declaration';
  if (/\b(?:async\s+)?function\s+[A-Za-z_$]/.test(text)) return 'function';
  if (/\bclass\s+[A-Za-z_$]/.test(text)) return 'class';
  if (/\bquerySelector(?:All)?\s*\(|\bgetElementById\s*\(/.test(text)) return 'dom';
  if (/\bJSON\.(?:parse|stringify)\s*\(/.test(text)) return 'json';
  if (/\bnew\s+(?:Map|Set|WeakMap|WeakSet)\b/.test(text)) return 'collection';
  if (/\bconsole\.(?:log|warn|error|info|debug)\s*\(/.test(text)) return 'logging';
  if (ext === '.html' && /^<\/?[A-Za-z]/.test(text)) return 'html';
  if (ext === '.css' && /[{}:]|@media|@keyframes/.test(text)) return 'css';
  if (ext === '.json' && /^"[^"]+"\s*:/.test(text)) return 'jsonKey';
  if ((ext === '.yml' || ext === '.yaml') && /^[A-Za-z0-9_.-]+\s*:/.test(text)) return 'yamlKey';
  if (/^[{}\[\](),;]+$/.test(text)) return 'structure';
  return 'statement';
}

const EXPLANATIONS = {
  blank: [
    'separa visualmente blocos lógicos e não executa comportamento.',
    'usa uma linha vazia para marcar mudança de assunto ou etapa.',
    'a separação reduz carga cognitiva em arquivos longos e deixa responsabilidades mais visíveis.',
    'compactar blocos sem separação dificulta revisão, navegação e localização de regressões.',
  ],
  comment: [
    'registra intenção, contexto, limitação ou decisão humana junto do código.',
    'usa a sintaxe de comentário do formato atual para preservar informação sem alterar a execução.',
    'decisões arquiteturais próximas da implementação evitam que o código seja reinterpretado fora do contexto.',
    'remover contexto força futuros mantenedores a adivinhar razões e pode levar a refatorações regressivas.',
  ],
  strict: [
    'ativa o modo estrito do JavaScript neste módulo.',
    'usa a diretiva reconhecida pelo motor antes das demais instruções.',
    'o modo estrito converte vários erros silenciosos em falhas explícitas e reduz globais acidentais.',
    'sem ele, erros de escopo e atribuições inválidas podem sobreviver mais tempo e contaminar estado global.',
  ],
  importScripts: [
    'carrega uma dependência no Service Worker da extensão.',
    'usa importScripts para inicializar módulos na ordem exigida pelo worker clássico atual.',
    'a ordem explícita evita dependências implícitas durante a reidratação do MV3.',
    'misturar um mecanismo incompatível com o tipo de worker pode impedir a inicialização do background inteiro.',
  ],
  require: [
    'resolve uma dependência CommonJS usada por Node, Jest ou fallbacks de teste.',
    'chama require e recebe a API exportada pelo módulo.',
    'mantém compatibilidade com a base de tooling e testes que já usa CommonJS.',
    'migrar apenas uma parte para ESM cria caminhos diferentes entre navegador, Node e CI.',
  ],
  export: [
    'expõe uma API do módulo para consumidores ou testes.',
    'publica funções e valores por module.exports ou exports.',
    'uma superfície explícita reduz acoplamento e permite isolamento em testes.',
    'efeitos colaterais globais escondem dependências e tornam mocks, reuso e diagnóstico mais frágeis.',
  ],
  chrome: [
    'interage com uma API privilegiada do Chromium necessária ao funcionamento da extensão.',
    'usa o namespace chrome disponível nos contextos autorizados pelo Manifest V3.',
    'tabs, storage, alarms, messaging, downloads e menus dependem das APIs oficiais do navegador.',
    'substituir por APIs comuns de página perde privilégios, contexto ou persistência e frequentemente não funciona.',
  ],
  observer: [
    'observa alterações dinâmicas no DOM.',
    'usa MutationObserver para reagir a nós e atributos alterados sem polling agressivo.',
    'Gemini e leitores de mangá alteram a interface assincronamente, então observação dirigida reduz latência e CPU.',
    'polling curto desperdiça recursos; polling longo perde eventos; assumir DOM estático cria falhas intermitentes.',
  ],
  indexeddb: [
    'acessa a camada persistente baseada em IndexedDB.',
    'lê ou grava estado durável pela API ou abstração do projeto.',
    'o Service Worker MV3 pode ser encerrado, então jobs e resultados importantes precisam sobreviver à memória volátil.',
    'guardar somente em variáveis locais perde estado após suspensão e pode duplicar ou abandonar trabalho.',
  ],
  storage: [
    'lê ou grava configuração persistente da extensão.',
    'usa chrome.storage ou a camada de storage compartilhada.',
    'preferências precisam sobreviver a recarregamentos e ficar consistentes entre contextos.',
    'estado somente em memória diverge entre abas e desaparece quando o worker reinicia.',
  ],
  fetch: [
    'inicia uma operação de rede.',
    'usa fetch e trata o resultado de forma assíncrona.',
    'Fetch integra com Promises, AbortSignal e contratos web padronizados.',
    'ignorar status, cancelamento ou assincronia pode gerar hangs, respostas parciais e efeitos fora de ordem.',
  ],
  listener: [
    'registra uma reação a evento.',
    'associa um callback por addEventListener.',
    'a extensão é orientada a eventos de DOM e UI, e listeners mantêm produtores e consumidores desacoplados.',
    'polling ou sobrescrever handlers únicos aumenta acoplamento e pode apagar listeners de outros componentes.',
  ],
  timer: [
    'agenda trabalho futuro ou um timeout de proteção.',
    'usa timer JavaScript ou chrome.alarms conforme o contexto.',
    'watchdogs e atrasos controlados impedem jobs eternos e coordenam etapas assíncronas.',
    'sem limite temporal uma etapa travada bloqueia fila; timers arbitrários demais também introduzem condições de corrida.',
  ],
  promiseAll: [
    'aguarda várias operações assíncronas como uma única barreira.',
    'agrega Promises com Promise.all e propaga falha quando uma etapa obrigatória falha.',
    'é apropriado quando as operações podem ocorrer em paralelo e todas são necessárias.',
    'serializar sem necessidade aumenta latência; ignorar falhas individuais pode deixar estado parcialmente aplicado.',
  ],
  await: [
    'espera uma dependência assíncrona antes de continuar.',
    'suspende logicamente a função async até a Promise resolver ou rejeitar.',
    'preserva causalidade quando a etapa seguinte depende do resultado anterior.',
    'remover await pode criar corrida, usar dados antes de existirem ou encerrar o fluxo cedo demais.',
  ],
  try: [
    'abre uma fronteira explícita de tratamento de erro.',
    'encapsula operações que podem lançar exceção para permitir recuperação contextual.',
    'DOM, rede e APIs do navegador possuem falhas esperáveis que precisam ser classificadas perto da origem.',
    'deixar toda exceção atravessar a cadeia pode abortar um lote inteiro e perder o contexto da causa.',
  ],
  catch: [
    'recebe uma exceção do bloco protegido.',
    'executa recuperação, log, conversão ou propagação controlada do erro.',
    'a decisão de recuperação fica perto da operação que entende o significado da falha.',
    'engolir erro mascara defeitos; não capturar falhas recuperáveis derruba fluxos maiores do que o necessário.',
  ],
  finally: [
    'define limpeza que deve ocorrer com sucesso ou falha.',
    'executa depois de try/catch independentemente do resultado.',
    'é apropriado para liberar flags, locks, listeners e recursos sem duplicar código.',
    'duplicar limpeza em vários retornos aumenta a chance de esquecer um caminho excepcional.',
  ],
  throw: [
    'interrompe o caminho atual com uma falha explícita.',
    'lança uma exceção para uma fronteira de erro superior.',
    'falhar cedo protege invariantes quando continuar produziria estado inválido.',
    'continuar após uma pré-condição quebrada tende a transformar um erro local em corrupção distante.',
  ],
  if: [
    'aplica uma guarda ou decisão condicional.',
    'avalia uma expressão booleana e executa o bloco apenas quando a condição é satisfeita.',
    'pré-condições explícitas tornam invariantes e caminhos excepcionais revisáveis.',
    'remover ou diluir a guarda pode permitir estado inválido e efeitos colaterais indevidos.',
  ],
  else: [
    'define o caminho alternativo de uma decisão.',
    'executa quando a condição anterior não é satisfeita.',
    'mantém caminhos mutuamente exclusivos juntos e evita recalcular a mesma condição.',
    'condições separadas podem divergir com o tempo e permitir combinações que deveriam ser impossíveis.',
  ],
  switch: [
    'despacha comportamento por um discriminador comum.',
    'compara um mesmo valor com múltiplos casos.',
    'é legível quando várias mensagens ou estados dependem da mesma chave.',
    'uma cadeia longa de if repetindo a comparação aumenta ruído e facilita inconsistência entre ramos.',
  ],
  case: [
    'declara um ramo específico do despacho atual.',
    'associa um valor de entrada a um bloco de comportamento.',
    'cada caso torna uma variante suportada explícita e auditável.',
    'um fallback genérico demais pode aceitar estados ou mensagens não reconhecidos e ocultar erro de protocolo.',
  ],
  loop: [
    'repete processamento sobre itens ou enquanto uma condição vale.',
    'usa uma estrutura de repetição do JavaScript.',
    'centraliza a lógica repetida e evita cópias que poderiam divergir.',
    'duplicação manual é difícil de manter; laços sem condição ou limite claros podem travar o worker.',
  ],
  return: [
    'encerra a função atual e opcionalmente devolve um valor.',
    'usa return para saída normal ou guarda antecipada.',
    'retornos de guarda reduzem aninhamento e impedem continuação após estado inválido.',
    'deixar o fluxo cair para etapas posteriores pode disparar efeitos colaterais indevidos.',
  ],
  declaration: [
    'declara um binding usado pelo fluxo atual.',
    'inicializa um valor com const, let ou var conforme necessidade de reatribuição e compatibilidade.',
    'nomes intermediários expõem intenção, facilitam inspeção e evitam repetir expressões complexas.',
    'inlining excessivo dificulta diagnóstico; mutabilidade desnecessária aumenta a superfície para alterações acidentais.',
  ],
  function: [
    'define uma unidade reutilizável de comportamento.',
    'agrupa parâmetros, regras e retorno sob um nome estável.',
    'funções delimitam responsabilidade, facilitam teste e evitam duplicação.',
    'espalhar a mesma lógica por listeners e ramos aumenta acoplamento e risco de correções inconsistentes.',
  ],
  class: [
    'define uma abstração que agrupa estado e comportamento relacionado.',
    'usa uma classe JavaScript com instâncias e métodos.',
    'faz sentido quando ciclo de vida e estado pertencem a uma entidade coerente.',
    'variáveis globais soltas tornam ownership, limpeza e concorrência muito mais ambíguos.',
  ],
  dom: [
    'localiza elementos da interface atual no DOM.',
    'usa seletores ou IDs para obter referências aos nós relevantes.',
    'a automação precisa descobrir controles existentes sem acoplar demais ao layout.',
    'índices fixos e seletores vagos quebram quando o site muda estrutura ou insere novos elementos.',
  ],
  json: [
    'serializa ou desserializa dados estruturados.',
    'converte entre objetos JavaScript e representação JSON.',
    'JSON é interoperável com storage, mensagens, arquivos e APIs.',
    'formatos ad hoc aumentam parsing frágil e incompatibilidade entre contextos.',
  ],
  collection: [
    'cria uma coleção com semântica de unicidade ou lookup eficiente.',
    'usa Map, Set ou variante fraca em vez de um array genérico.',
    'a estrutura escolhida expressa melhor o contrato e evita buscas lineares repetidas.',
    'arrays usados como mapas facilitam duplicatas e custam mais para procurar chaves.',
  ],
  logging: [
    'emite diagnóstico observável.',
    'usa console no nível correspondente à severidade.',
    'fluxos assíncronos e multi-contexto precisam de evidência temporal para suporte e regressão.',
    'sem logs falhas intermitentes ficam opacas; logs indiscriminados, porém, também escondem eventos importantes no ruído.',
  ],
  html: [
    'declara parte da estrutura visual ou semântica da interface.',
    'usa uma tag HTML e seus atributos.',
    'estrutura previsível facilita estilos, acessibilidade, automação e testes.',
    'construir tudo dinamicamente sem necessidade aumenta complexidade e fragilidade dos seletores.',
  ],
  css: [
    'define parte da apresentação visual, estado ou responsividade.',
    'usa regra CSS, propriedade, seletor ou bloco.',
    'manter apresentação no CSS separa layout e tema da lógica JavaScript.',
    'estilos inline e cálculos visuais no JavaScript aumentam acoplamento e dificultam manutenção.',
  ],
  jsonKey: [
    'define uma chave de configuração ou dado JSON.',
    'associa um nome serializado a um valor.',
    'a chave forma um contrato legível por ferramentas e runtime.',
    'renomear ou remover sem migrar consumidores quebra contratos de carregamento e configuração.',
  ],
  yamlKey: [
    'declara uma propriedade de workflow ou configuração YAML.',
    'usa chave e bloco hierárquico definidos por indentação.',
    'a estrutura declarativa deixa CI e automação reproduzíveis e revisáveis.',
    'indentação ou escopo incorretos podem mudar o workflow de forma sutil e difícil de detectar.',
  ],
  structure: [
    'abre, fecha ou separa uma estrutura sintática.',
    'usa delimitadores de bloco, lista, chamada ou instrução.',
    'esses delimitadores preservam escopo e a árvore sintática do bloco.',
    'mover ou omitir delimitadores muda escopo, ordem de avaliação ou produz erro de sintaxe.',
  ],
  statement: [
    'executa uma instrução do formato atual dentro do bloco onde aparece.',
    'combina identificadores, operadores e estado construídos pelas linhas vizinhas.',
    'a posição atual preserva ordem, contrato e efeitos colaterais esperados do bloco.',
    'reescrever a linha isoladamente sem considerar dependências e ordem assíncrona pode introduzir regressão mesmo parecendo equivalente.',
  ],
};

function explainLine(line, relative) {
  return EXPLANATIONS[classifyLine(line, relative)] || EXPLANATIONS.statement;
}

module.exports = { classifyLine, explainLine };
