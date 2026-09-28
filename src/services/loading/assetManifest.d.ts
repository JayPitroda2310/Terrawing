declare module 'virtual:asset-manifest' {
  const files: readonly { url: string; size: number }[];
  export default files;
}
