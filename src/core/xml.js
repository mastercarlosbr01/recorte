/**
 * Formatação de XML por reindentação do TEXTO ORIGINAL.
 *
 * `XMLSerializer` não serve: ele normaliza namespace, reescreve entidade,
 * troca aspas de atributo e pode reordenar coisas. Aqui o texto de cada
 * token sai exatamente como entrou — só o espaçamento ENTRE elementos muda.
 *
 * E só muda onde é seguro mudar. Em `<p>Olá <b>mundo</b></p>` o espaço antes
 * de `<b>` é conteúdo: indentar ali mudaria o que o documento diz. Por isso
 * elemento com conteúdo misto sai intacto, byte a byte.
 */

const INDENT = '  ';
const NOME = /^[A-Za-z_:][A-Za-z0-9._:·-]*/;

/**
 * Lista de atributos bem formada, pelas regras do XML e não as do HTML.
 *
 * O XML exige valor entre aspas e proíbe atributo repetido. `<a t=1>` e
 * `<a t="1" t="2">` são HTML tolerante, não XML — o DOMParser recusa os
 * dois.
 *
 * Por que isto importa mesmo com o DOMParser confirmando do outro lado: sem
 * esta checagem, o tokenizador aceitava e o DOMParser recusava, então o
 * resultado no navegador era .txt e o resultado no teste em Node era .xml.
 * O usuário não via defeito, e a suíte mentia. Discordância silenciosa
 * entre o que o teste vê e o que o navegador faz já custou duas rodadas
 * neste projeto; o tokenizador é a fonte da verdade e precisa valer sozinho.
 */
function atributosValidos(resto) {
  const vistos = new Set();
  const n = resto.length;
  let i = 0;

  const pularBrancos = () => { while (i < n && /\s/.test(resto[i])) i++; };

  while (true) {
    pularBrancos();
    if (i >= n) return true;

    const m = resto.slice(i).match(NOME);
    if (!m) return false;
    if (vistos.has(m[0])) return false;
    vistos.add(m[0]);
    i += m[0].length;

    pularBrancos();
    if (resto[i] !== '=') return false;
    i++;

    pularBrancos();
    const aspa = resto[i];
    if (aspa !== '"' && aspa !== "'") return false;
    const fecha = resto.indexOf(aspa, i + 1);
    if (fecha === -1) return false;
    i = fecha + 1;

    // depois do valor só pode vir espaço ou o fim da tag
    if (i < n && !/\s/.test(resto[i])) return false;
  }
}

/**
 * Quebra o texto em tokens, guardando os offsets de cada um para poder
 * reemitir o trecho original.
 *
 * @returns {{tokens: Array}|{erro: string}}
 */
export function tokenizarXML(texto) {
  const tokens = [];
  const n = texto.length;
  let i = 0;

  /** Fim de uma tag, ignorando `>` que estiver dentro de aspas de atributo. */
  const fimDaTag = (k) => {
    let aspas = null;
    while (k < n) {
      const c = texto[k];
      if (aspas) {
        if (c === aspas) aspas = null;
      } else if (c === '"' || c === "'") {
        aspas = c;
      } else if (c === '>') {
        return k;
      }
      k++;
    }
    return -1;
  };

  while (i < n) {
    const abre = texto.indexOf('<', i);

    if (abre === -1) {
      tokens.push({ tipo: 'texto', ini: i, fim: n });
      break;
    }
    if (abre > i) {
      tokens.push({ tipo: 'texto', ini: i, fim: abre });
    }

    // ---- blocos que vão inteiros, sem interpretação
    if (texto.startsWith('<!--', abre)) {
      const f = texto.indexOf('-->', abre + 4);
      if (f === -1) return { erro: 'comentário não fechado' };
      tokens.push({ tipo: 'comentario', ini: abre, fim: f + 3 });
      i = f + 3;
      continue;
    }

    if (texto.startsWith('<![CDATA[', abre)) {
      const f = texto.indexOf(']]>', abre + 9);
      if (f === -1) return { erro: 'CDATA não fechado' };
      tokens.push({ tipo: 'cdata', ini: abre, fim: f + 3 });
      i = f + 3;
      continue;
    }

    if (texto.startsWith('<?', abre)) {
      const f = texto.indexOf('?>', abre + 2);
      if (f === -1) return { erro: 'instrução de processamento não fechada' };
      const ehDecl = /^<\?xml[\s?]/i.test(texto.slice(abre, abre + 6));
      tokens.push({ tipo: ehDecl ? 'declaracao' : 'pi', ini: abre, fim: f + 2 });
      i = f + 2;
      continue;
    }

    if (texto.startsWith('<!', abre)) {
      const f = fimDaTag(abre + 2);
      if (f === -1) return { erro: 'declaração de tipo não fechada' };
      tokens.push({ tipo: 'doctype', ini: abre, fim: f + 1 });
      i = f + 1;
      continue;
    }

    // ---- fechamento
    if (texto.startsWith('</', abre)) {
      const f = fimDaTag(abre + 2);
      if (f === -1) return { erro: 'tag de fechamento não fechada' };
      // tag de fechamento não tem atributo: `</a foo>` é inválido
      const dentro = texto.slice(abre + 2, f).trim();
      const nome = (dentro.match(NOME) ?? [])[0];
      if (!nome) return { erro: 'nome inválido em tag de fechamento' };
      if (nome !== dentro) return { erro: `lixo na tag de fechamento </${dentro}>` };
      tokens.push({ tipo: 'fechamento', ini: abre, fim: f + 1, nome });
      i = f + 1;
      continue;
    }

    // ---- abertura ou autofechado
    const f = fimDaTag(abre + 1);
    if (f === -1) return { erro: 'tag não fechada' };
    const corpo = texto.slice(abre + 1, f);
    const nome = (corpo.match(NOME) ?? [])[0];
    if (!nome) return { erro: 'nome de elemento inválido' };

    const autofechado = corpo.trimEnd().endsWith('/');

    // o que vem depois do nome são os atributos; a barra do autofechado não é
    const resto = corpo.slice(nome.length).replace(/\/\s*$/, '');
    if (!atributosValidos(resto)) return { erro: `atributos inválidos em <${nome}>` };
    tokens.push({
      tipo: autofechado ? 'autofechado' : 'abertura',
      ini: abre,
      fim: f + 1,
      nome,
    });
    i = f + 1;
  }

  return { tokens };
}

/**
 * Monta a árvore e valida de uma vez: bem formado e com exatamente um
 * elemento raiz. Texto solto fora do raiz também reprova.
 */
export function montarArvore(texto, tokens) {
  const raiz = { tipo: 'raiz', filhos: [] };
  const pilha = [raiz];

  for (const t of tokens) {
    const topo = pilha[pilha.length - 1];

    if (t.tipo === 'abertura') {
      const el = { tipo: 'elemento', nome: t.nome, abertura: t, fechamento: null, filhos: [] };
      topo.filhos.push(el);
      pilha.push(el);
      continue;
    }

    if (t.tipo === 'fechamento') {
      if (pilha.length === 1) return { erro: `</${t.nome}> sem abertura` };
      const el = pilha.pop();
      if (el.nome !== t.nome) return { erro: `<${el.nome}> fechado por </${t.nome}>` };
      el.fechamento = t;
      continue;
    }

    if (t.tipo === 'texto') {
      const bruto = texto.slice(t.ini, t.fim);
      if (pilha.length === 1 && bruto.trim() !== '') {
        return { erro: 'texto fora do elemento raiz' };
      }
      topo.filhos.push({ ...t, bruto });
      continue;
    }

    topo.filhos.push(t);
  }

  if (pilha.length !== 1) {
    return { erro: `elemento <${pilha[pilha.length - 1].nome}> não foi fechado` };
  }

  const elementos = raiz.filhos.filter((f) => f.tipo === 'elemento' || f.tipo === 'autofechado');
  if (elementos.length === 0) return { erro: 'nenhum elemento raiz' };
  if (elementos.length > 1) return { erro: 'mais de um elemento raiz' };

  return { raiz };
}

/**
 * Conteúdo misto: há texto de verdade ou CDATA entre os filhos diretos.
 * Nesse caso o espaçamento é significativo e o elemento sai intocado.
 */
function temConteudoMisto(el) {
  return el.filhos.some(
    (f) => (f.tipo === 'texto' && f.bruto.trim() !== '') || f.tipo === 'cdata'
  );
}

export function reindentarXML(texto, raiz) {
  const linhas = [];
  const bruto = (t) => texto.slice(t.ini, t.fim);

  const emitir = (no, nivel) => {
    const ind = INDENT.repeat(nivel);

    if (no.tipo !== 'elemento') {
      linhas.push(ind + bruto(no));
      return;
    }

    // elemento vazio: <a></a> numa linha só
    const comConteudo = no.filhos.filter(
      (f) => f.tipo !== 'texto' || f.bruto.trim() !== ''
    );
    if (comConteudo.length === 0) {
      linhas.push(ind + bruto(no.abertura) + bruto(no.fechamento));
      return;
    }

    if (temConteudoMisto(no)) {
      // verbatim: o espaço aqui dentro é conteúdo, não formatação
      linhas.push(ind + texto.slice(no.abertura.ini, no.fechamento.fim));
      return;
    }

    linhas.push(ind + bruto(no.abertura));
    for (const f of comConteudo) emitir(f, nivel + 1);
    linhas.push(ind + bruto(no.fechamento));
  };

  for (const f of raiz.filhos) {
    if (f.tipo === 'texto' && f.bruto.trim() === '') continue;
    emitir(f, 0);
  }

  return linhas.join('\n');
}

/**
 * @param {string} texto
 * @param {(t: string) => boolean} [confirmar]
 *        checagem extra opcional. Em produção é o DOMParser do documento
 *        offscreen: se ele discordar do analisador daqui, o conservador
 *        vence e o conteúdo cai para .txt.
 * @returns {{ok: boolean, texto: string|null, erro?: string}}
 */
export function formatarXML(texto, confirmar) {
  const limpo = texto.trim();
  if (!limpo.startsWith('<')) return { ok: false, texto: null, erro: 'não começa com <' };

  const t = tokenizarXML(limpo);
  if (t.erro) return { ok: false, texto: null, erro: t.erro };

  const a = montarArvore(limpo, t.tokens);
  if (a.erro) return { ok: false, texto: null, erro: a.erro };

  if (confirmar && !confirmar(limpo)) {
    return { ok: false, texto: null, erro: 'reprovado na checagem do navegador' };
  }

  return { ok: true, texto: reindentarXML(limpo, a.raiz) };
}
