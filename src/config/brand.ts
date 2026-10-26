/**
 * Identidade da Mawe Create.
 *
 * As logos oficiais ainda não estão no projeto. Para adicioná-las, salve os
 * arquivos em `public/brand/` com os nomes abaixo (veja public/brand/LEIA-ME.md).
 * O sistema tenta cada caminho na ordem e usa o primeiro que existir.
 * Enquanto nenhum existir, apenas o nome é exibido em texto — nenhuma logo
 * substituta é desenhada.
 */
export const BRAND = {
  agencyName: 'Mawe Create',
  productName: 'Mawe OS',
  /** Logo horizontal com o nome "Mawe Create" (versão clara, para fundo marrom). */
  logoHorizontal: ['public/brand/logo-horizontal-clara.svg', 'public/brand/logo-horizontal-clara.png', 'public/brand/logo-horizontal.svg', 'public/brand/logo-horizontal.png'],
  /** Monograma "M" dentro do arco (foto de perfil). Usado no ícone da aba e no menu recolhido. */
  monogram: ['public/brand/monograma.svg', 'public/brand/monograma.png'],
} as const;
