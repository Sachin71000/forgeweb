// Reviewed against ForgeWeb's own tested Node 22 build. This is a reproducible
// baseline, not a substitute for auditing each resolved generated lockfile.
export const GENERATED_VITE_VERSION='8.2.4';
export const GENERATED_REACT_PLUGIN_VERSION='6.0.5';

export function frontendToolchainIssues(files:Array<{path:string;content:string}>):string[]{
  const file=files.find(file=>file?.path==='package.json');
  if(!file)return [];
  let pkg:{dependencies?:Record<string,unknown>;devDependencies?:Record<string,unknown>};
  try{pkg=JSON.parse(file.content);if(!pkg||typeof pkg!=='object')throw new Error();}catch{return ['Generated package.json is invalid'];}
  const vite=[pkg.dependencies?.vite,pkg.devDependencies?.vite].filter(version=>version!==undefined);
  const issues:string[]=[];
  if(!vite.length||vite.some(version=>version!==GENERATED_VITE_VERSION))issues.push(`Generated package.json must pin vite to the reviewed ${GENERATED_VITE_VERSION} baseline; legacy or unreviewed build-tool ranges are not accepted`);
  const plugin=[pkg.dependencies?.['@vitejs/plugin-react'],pkg.devDependencies?.['@vitejs/plugin-react']].filter(version=>version!==undefined);
  if(plugin.some(version=>version!==GENERATED_REACT_PLUGIN_VERSION))issues.push(`When declared, @vitejs/plugin-react must use the reviewed ${GENERATED_REACT_PLUGIN_VERSION} version compatible with Vite ${GENERATED_VITE_VERSION}`);
  return issues;
}
