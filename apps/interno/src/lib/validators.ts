// Re-export dos validadores (CPF, CNPJ, placa, etc.). Fonte da verdade em
// `packages/shared/src/validators.ts` (@sislog/shared/validators), compartilhada
// com o portal de parceiros. Mantido como atalho para os imports
// `@/lib/validators` já existentes no app.
export * from '@sislog/shared/validators'
