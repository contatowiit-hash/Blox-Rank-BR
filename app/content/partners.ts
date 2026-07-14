export interface Partner {
  name: string;
  handle: string;
  platform: string;
  url: `https://${string}`;
  description: string;
  /** Use uma imagem local dentro de public/partners/. */
  photoPath?: `/partners/${string}`;
}

// Adicione somente parceiros anunciados oficialmente. A lista vazia é intencional.
export const partners: readonly Partner[] = [];
