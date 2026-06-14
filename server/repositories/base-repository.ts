export const toSnakeCaseName = (value: string) =>
  value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)

export const toCamelCaseName = (value: string) =>
  value.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase())
