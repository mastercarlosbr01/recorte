# Recorte

Extensão do Chrome com uma função só: selecionar texto numa página, clicar com
o botão direito e salvar a seleção como arquivo, já formatado e com a extensão
certa.

```
Exportar seleção ▸ Automático
                   .json
                   .xml
                   .txt
```

**Automático** decide pelo conteúdo: JSON válido vira `.json` indentado, XML bem
formado vira `.xml` indentado, o resto vira `.txt` limpo.

**Tipo forçado** respeita o pedido quando dá. Se você pedir `.json` num texto que
não é JSON, o arquivo sai como `.txt` e o ícone acende um selo `TXT` por quatro
segundos — sem notificação do sistema, sem permissão extra.

Tudo acontece na sua máquina. Nenhuma chamada de rede, nenhuma biblioteca
externa, nenhuma telemetria. A CSP do manifest declara `connect-src 'none'`, e a
auditoria falha se alguém escrever um `fetch` por engano.

## Por que não reserializa

Formatar aqui é reindentar o texto original, caractere a caractere. Nunca
`JSON.stringify(JSON.parse(x))` e nunca `XMLSerializer`. O caminho fácil
estragaria dados silenciosamente:

| o que entra | reserializado sairia | aqui sai |
| --- | --- | --- |
| `{"id":9007199254740993}` | `9007199254740992` | intacto |
| `{"a":1,"a":2}` | `{"a":2}` | intacto |
| `{"v":1e3}` | `1000` | intacto |
| `<a xmlns:x="u"><x:b/></a>` | prefixo reescrito | intacto |
| `&apos;` no XML | vira `'` | intacto |

A seleção costuma ser a única cópia que a pessoa tem daquele dado. O formatador
pode recusar o trabalho; não pode devolver outro conteúdo.

Em XML, elemento com conteúdo misto (texto e filhos juntos, como
`<p>oi <b>tudo</b></p>`) é emitido literalmente: ali o espaço em branco é
conteúdo, e reindentar mudaria o documento.

## Permissões

| permissão | para quê |
| --- | --- |
| `contextMenus` | o menu do botão direito |
| `activeTab` + `scripting` | ler a seleção, só no clique, só na aba do clique |
| `downloads` | salvar o arquivo |
| `offscreen` | `DOMParser` e `URL.createObjectURL`, que o service worker MV3 não tem |

Sem `host_permissions`. A extensão não tem acesso a nenhum site até você clicar
no menu, e o acesso morre junto com o clique.

`info.selectionText` existe e seria mais simples, mas o Chrome normaliza o
espaçamento dele — um JSON indentado chega numa linha só. Por isso a seleção é
lida da página, com `info.selectionText` só como reserva quando a injeção é
recusada (páginas `chrome://`, a Web Store, PDFs).

## Estrutura

```
src/core/            formatadores puros, sem API do Chrome — é o que os testes cobrem
  json.js            valida com JSON.parse, reindenta o texto original
  xml.js             tokenizador e validador próprios (testáveis no Node)
  txt.js             limpeza conservadora
  nome.js            nome de arquivo válido no Windows
  detectar.js        decide a extensão e se o pedido foi atendido
src/offscreen/       formata e gera o blob; DOMParser confirma o XML
src/background/      menu, leitura da seleção, download, selo
```

O analisador de XML em `src/core/xml.js` é a fonte da verdade porque roda no
Node e está sob teste. O `DOMParser` do offscreen entra como segunda opinião: se
os dois discordarem, vence o conservador e o conteúdo vira `.txt`.

## Rodar

```
npm run check       testes + auditoria de segurança
npm test            só os testes
npm run audit       só a auditoria
npm run icones      regera os ícones provisórios
npm run empacotar   zip para a loja (roda check antes)
```

Sem dependências. Node puro, sem framework de teste, sem bundler.

### Carregar no Chrome

`chrome://extensions` → modo desenvolvedor → **Carregar sem compactação** →
apontar para a raiz deste repositório.

## Estado

Versão 0.1.0, não publicada. Os ícones em `assets/` são provisórios, gerados por
script — trocar por arte antes de qualquer publicação.
