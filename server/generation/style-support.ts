import {ApiError} from '../lib.ts';

export function frontendStyleSupport(files:Array<{path:string;content:string}>,requirementIds:string[]):Array<{path:string;content:string;requirementIds:string[]}>{
  const styles=files.find(file=>file.path==='frontend/src/styles.css')?.content??'';
  if(!/@(?:tailwind|apply)\b/.test(styles))return [];
  let pkg:{dependencies?:Record<string,string>;devDependencies?:Record<string,string>};
  try{pkg=JSON.parse(files.find(file=>file.path==='package.json')?.content??'{}');}catch{throw new ApiError(422,'MODEL_PACKAGE_INVALID','Invalid package.json for CSS tooling.');}
  const version=pkg.devDependencies?.tailwindcss??pkg.dependencies?.tailwindcss??'';
  if(!/^[~^]?3\./.test(version))throw new ApiError(422,'MODEL_STYLE_CONFIG_INVALID','Generated Tailwind directives require an explicitly declared supported Tailwind 3 dependency; no unprocessed CSS may be exported.');
  return [
    {path:'postcss.config.cjs',content:"module.exports = {plugins: {tailwindcss: {config: './tailwind.config.cjs'}}};\n",requirementIds},
    {path:'tailwind.config.cjs',content:"module.exports = {content: ['./index.html', './frontend/src/**/*.{js,ts,jsx,tsx}'], theme: {extend: {}}, plugins: []};\n",requirementIds},
  ];
}
