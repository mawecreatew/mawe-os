/**
 * Identidade da Mawe Create.
 *
 * Logos oficiais em `public/brand/` (veja public/brand/LEIA-ME.md).
 * O sistema tenta cada caminho na ordem e usa o primeiro que existir; se
 * nenhum existir, mostra apenas o nome em texto — nunca uma logo substituta.
 */
export const BRAND = {
  agencyName: 'Mawe Create',
  productName: 'Mawe OS',
  /** Logo horizontal "Mawe Create" sobre o marrom oficial (#2A211C), o mesmo do menu. */
  logoHorizontal: ['public/brand/logo-horizontal.png'],
  /** Monograma "M" dentro do arco (foto de perfil). */
  monogram: ['public/brand/monograma.png'],
} as const;
